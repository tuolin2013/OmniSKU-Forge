# backend/app/api/core/services/storage.py
"""
对象存储服务封装（S3 兼容，多后端可配置）。

支持的存储后端（均通过 S3 兼容协议接入，由 boto3 统一驱动）：
  • Cloudflare R2   —— 海外，默认
  • 阿里云 OSS       —— 国内推荐，国内访问延迟低
  • 腾讯云 COS       —— 国内备选
  • 任意 S3 兼容存储 —— MinIO / 自建等

切换方式：在 .env 设置 STORAGE_PROVIDER=r2|oss|cos|s3 并配置对应的
endpoint / domain / key / bucket（统一用 STORAGE_* 前缀的环境变量；
为向后兼容，未设置 STORAGE_* 时回退读取旧的 R2_* 变量）。

所有存储操作统一在此模块，main.py 和路由层不再直接操作 boto3。
"""

import os
import time
import logging
import boto3
from botocore.config import Config as BotoConfig
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


def _env(*names: str, default: str = "") -> str:
    """按优先级读取多个环境变量名，返回第一个非空值（用于 STORAGE_* → R2_* 向后兼容）。"""
    for name in names:
        val = os.environ.get(name)
        if val:
            return val
    return default


class StorageConfig:
    """
    通用对象存储配置（S3 兼容）。

    优先读取 STORAGE_* 变量，未设置时回退到旧的 R2_* 变量（向后兼容）。

    各后端 endpoint 示例：
      R2:  https://<account>.r2.cloudflarestorage.com   region=auto
      OSS: https://oss-cn-hangzhou.aliyuncs.com          region=oss-cn-hangzhou
      COS: https://cos.ap-guangzhou.myqcloud.com         region=ap-guangzhou
    """

    # 存储后端类型：r2 / oss / cos / s3（仅用于日志和 region 默认值推断）
    PROVIDER: str = _env("STORAGE_PROVIDER", default="r2").lower()

    ENDPOINT_URL: str = _env(
        "STORAGE_ENDPOINT_URL", "R2_ENDPOINT_URL",
        default="https://07671f3a11d783cb639fb2dc30ed4ae2.r2.cloudflarestorage.com",
    )
    PUBLIC_DOMAIN: str = _env(
        "STORAGE_PUBLIC_DOMAIN", "R2_PUBLIC_DOMAIN",
        default="https://assets.laotuo.top",
    )
    ACCESS_KEY_ID: str = _env("STORAGE_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID")
    SECRET_ACCESS_KEY: str = _env("STORAGE_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY")
    BUCKET_NAME: str = _env("STORAGE_BUCKET_NAME", "R2_BUCKET_NAME", default="ai-products")
    # region：R2 用 "auto"，OSS/COS 需填具体区域（如 oss-cn-hangzhou / ap-guangzhou）
    REGION: str = _env("STORAGE_REGION", "R2_REGION", default="auto")

    @classmethod
    def public_url(cls, file_key: str) -> str:
        domain = cls.PUBLIC_DOMAIN.rstrip("/")
        if not domain.startswith(("http://", "https://")):
            domain = f"https://{domain}"
        return f"{domain}/{file_key}"


# 向后兼容别名：旧代码中引用的 R2Config 仍可用
R2Config = StorageConfig


def _resolve_proxies() -> dict | None:
    """读取代理配置，供 boto3 访问海外对象存储（如 Cloudflare R2）时走代理。

    国内/内网主机直连 *.r2.cloudflarestorage.com 时，TLS 握手常被中途重置
    （表现为 `SSL: UNEXPECTED_EOF_WHILE_READING`），导致上传/列表全部失败。
    配置一个本地/可达的 HTTP 代理即可让这条链路稳定。

    优先读取 STORAGE_PROXY_URL / R2_PROXY_URL（同时用于 http 与 https），
    其次回退到标准的 HTTPS_PROXY / HTTP_PROXY 环境变量。
    返回 None 表示不使用代理（直连）。
    """
    explicit = _env("STORAGE_PROXY_URL", "R2_PROXY_URL")
    if explicit:
        return {"http": explicit, "https": explicit}

    https_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    http_proxy = os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    proxies = {}
    if http_proxy:
        proxies["http"] = http_proxy
    if https_proxy:
        proxies["https"] = https_proxy
    return proxies or None


def _build_s3_client():
    proxies = _resolve_proxies()
    cfg_kwargs = dict(
        signature_version="s3v4",
        retries={"max_attempts": 3, "mode": "standard"},
        connect_timeout=30,
        read_timeout=300,
    )
    if proxies:
        logger.info("☁️ R2 客户端启用代理: %s", proxies)
        cfg_kwargs["proxies"] = proxies
    cfg = BotoConfig(**cfg_kwargs)
    return boto3.client(
        "s3",
        endpoint_url=StorageConfig.ENDPOINT_URL,
        aws_access_key_id=StorageConfig.ACCESS_KEY_ID,
        aws_secret_access_key=StorageConfig.SECRET_ACCESS_KEY,
        config=cfg,
        region_name=StorageConfig.REGION,
    )



class R2StorageService:
    """R2 存储服务，无状态，每次方法调用按需创建 S3 客户端。"""

    # ------------------------------------------------------------------ #
    # 上传
    # ------------------------------------------------------------------ #
    @staticmethod
    def upload_bytes(
        data: bytes,
        record_id: str,
        ext: str = "png",
        content_type: str = "image/png",
    ) -> str:
        """
        上传字节流到 R2，返回公开访问 URL。
        文件路径固定为 uploads/{record_id}.{ext}。
        """
        if not data:
            raise ValueError("上传数据不能为空")

        file_key = f"uploads/{record_id}.{ext}"
        logger.info("☁️ 写入 R2: bucket=%s key=%s", R2Config.BUCKET_NAME, file_key)

        s3 = _build_s3_client()
        for attempt in range(1, 4):
            try:
                s3.put_object(
                    Bucket=R2Config.BUCKET_NAME,
                    Key=file_key,
                    Body=data,
                    ContentType=content_type,
                )
                return R2Config.public_url(file_key)
            except Exception as exc:
                logger.warning("R2 上传第 %d 次失败: %s", attempt, exc)
                if attempt == 3:
                    raise
                time.sleep(1)

    # ------------------------------------------------------------------ #
    # 分页列表
    # ------------------------------------------------------------------ #
    # 支持的媒体扩展名
    IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}
    AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a", ".opus"}
    VIDEO_EXTS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}

    @staticmethod
    def list_images(page: int = 1, limit: int = 30, file_type: str = "all") -> tuple[list[dict], bool]:
        """
        返回 (media_list, has_more)。
        media_list 每项包含 url / key / size / last_modified。
        file_type: "all" | "image" | "audio" | "video"
        """
        s3 = _build_s3_client()
        try:
            # 拉取最多 5000 条（分页获取所有对象）
            all_objects = []
            kwargs = {"Bucket": R2Config.BUCKET_NAME, "MaxKeys": 1000}
            while True:
                resp = s3.list_objects_v2(**kwargs)
                all_objects.extend(resp.get("Contents", []))
                if not resp.get("IsTruncated"):
                    break
                kwargs["ContinuationToken"] = resp["NextContinuationToken"]

            if not all_objects:
                return [], False

            sorted_files = sorted(all_objects, key=lambda x: x["LastModified"], reverse=True)

            def _match(key: str) -> bool:
                ext = "." + key.rsplit(".", 1)[-1].lower() if "." in key else ""
                if file_type == "image":
                    return ext in R2StorageService.IMAGE_EXTS
                if file_type == "audio":
                    return ext in R2StorageService.AUDIO_EXTS
                if file_type == "video":
                    return ext in R2StorageService.VIDEO_EXTS
                # "all" — 返回所有已知媒体格式
                return ext in (
                    R2StorageService.IMAGE_EXTS
                    | R2StorageService.AUDIO_EXTS
                    | R2StorageService.VIDEO_EXTS
                )

            all_media = [
                {
                    "url": R2Config.public_url(obj["Key"]),
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                }
                for obj in sorted_files
                if _match(obj["Key"])
            ]

            start = (page - 1) * limit
            end = start + limit
            return all_media[start:end], len(all_media) > end
        except Exception as exc:
            logger.error("R2 列表拉取失败: %s", exc)
            return [], False

    # ------------------------------------------------------------------ #
    # 删除
    # ------------------------------------------------------------------ #
    @staticmethod
    def delete(file_key: str) -> bool:
        s3 = _build_s3_client()
        try:
            s3.delete_object(Bucket=R2Config.BUCKET_NAME, Key=file_key)
            return True
        except Exception as exc:
            logger.error("R2 删除失败 key=%s: %s", file_key, exc)
            return False

    @staticmethod
    def batch_delete(file_keys: list[str]) -> tuple[int, int]:
        """返回 (成功数, 总数)。"""
        success = sum(1 for k in file_keys if R2StorageService.delete(k))
        return success, len(file_keys)

    # ------------------------------------------------------------------ #
    # 重命名（copy + delete）
    # ------------------------------------------------------------------ #
    @staticmethod
    def rename(old_key: str, new_key: str) -> bool:
        s3 = _build_s3_client()
        try:
            s3.copy_object(
                Bucket=R2Config.BUCKET_NAME,
                CopySource={"Bucket": R2Config.BUCKET_NAME, "Key": old_key},
                Key=new_key,
            )
            s3.delete_object(Bucket=R2Config.BUCKET_NAME, Key=old_key)
            return True
        except Exception as exc:
            logger.error("R2 重命名失败 %s -> %s: %s", old_key, new_key, exc)
            return False


# 单例，供路由层直接 import 使用
r2 = R2StorageService()
