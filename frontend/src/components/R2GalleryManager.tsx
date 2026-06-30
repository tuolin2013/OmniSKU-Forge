// frontend/src/components/R2GalleryManager.tsx
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
import React, { useState } from 'react';
import { Modal, Button, message, Upload, Input, Spin, Popconfirm, Tag, Select } from 'antd';
import {
  CloudOutlined, UploadOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, SoundOutlined, VideoCameraOutlined,
  PictureOutlined, DownloadOutlined, CopyOutlined,
} from '@ant-design/icons';

interface MediaItem {
  url: string;
  key: string;
  size: number;
  last_modified: string;
}

type MediaType = 'all' | 'image' | 'audio' | 'video';

const getMediaType = (key: string): 'image' | 'audio' | 'video' | 'other' => {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'other';
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const getDisplayName = (key: string) => {
  const parts = key.split('/');
  return parts[parts.length - 1];
};

const TYPE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  image: { color: 'blue',   icon: <PictureOutlined />,      label: '图片' },
  audio: { color: 'purple', icon: <SoundOutlined />,         label: '音频' },
  video: { color: 'green',  icon: <VideoCameraOutlined />,   label: '视频' },
  other: { color: 'default', icon: <CloudOutlined />,        label: '文件' },
};

export default function R2GalleryManager() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [activeUploads, setActiveUploads] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);

  const [typeFilter, setTypeFilter] = useState<MediaType>('all');
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  const fetchMedia = async (pageNum: number, append = false) => {
    setFetching(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/r2/images?page=${pageNum}&limit=40`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.code === 200) {
        // backend may return data.data.media or data.data.urls (older API)
        const items: MediaItem[] = data.data.media || (data.data.urls || []).map((u: string) => ({ url: u, key: u.split('/').pop() || u, size: 0, last_modified: '' }));
        setMediaList(prev => append ? [...prev, ...items] : items);
        setHasMore(data.data.has_more);
        setPage(pageNum);
      }
    } catch (err: any) {
      message.error(`获取资产库失败: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleOpen = () => {
    setIsModalVisible(true);
    if (mediaList.length === 0) fetchMedia(1);
  };

  const handleUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    setActiveUploads(prev => prev + 1);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/v1/r2/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.code === 200) {
        onSuccess(data, file);
      } else {
        throw new Error(data.message);
      }
    } catch (e: any) {
      message.error(`${file.name} 上传失败: ${e.message}`);
      onError(e);
    } finally {
      setActiveUploads(prev => {
        const next = prev - 1;
        if (next === 0) {
          message.success('全部上传完成');
          fetchMedia(1);
        }
        return next;
      });
    }
  };

  const handleDelete = async (fileKey: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/r2/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_key: fileKey }),
      });
      const data = await res.json();
      if (data.code === 200) {
        message.success('删除成功');
        setMediaList(prev => prev.filter(m => m.key !== fileKey));
        setSelectedKeys(prev => prev.filter(k => k !== fileKey));
      } else {
        message.error(`删除失败: ${data.message}`);
      }
    } catch {
      message.error('请求失败');
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedKeys.length) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/r2/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_keys: selectedKeys }),
      });
      const data = await res.json();
      if (data.code === 200 || data.code === 206) {
        message.success(data.message);
        setMediaList(prev => prev.filter(m => !selectedKeys.includes(m.key)));
        setSelectedKeys([]);
        setIsBatchMode(false);
      } else {
        message.error(`批量删除失败: ${data.message}`);
      }
    } catch {
      message.error('请求失败');
    }
  };

  const handleRename = async (fileKey: string) => {
    if (!newName.trim()) return message.warning('名称不能为空');
    try {
      const res = await fetch(`${API_BASE}/api/v1/r2/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_key: fileKey, new_name: newName.trim() }),
      });
      const data = await res.json();
      if (data.code === 200) {
        message.success('重命名成功');
        setRenamingKey(null);
        setNewName('');
        setMediaList(prev => prev.map(m =>
          m.key === fileKey ? { ...m, key: data.data.new_key, url: data.data.new_url } : m
        ));
      } else {
        message.error(`重命名失败: ${data.message}`);
      }
    } catch {
      message.error('请求失败');
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => message.success('链接已复制'));
  };

  const toggleSelection = (key: string) => {
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // ── Filtered list ──
  const filteredList = typeFilter === 'all'
    ? mediaList
    : mediaList.filter(m => getMediaType(m.key) === typeFilter);

  const countByType = (t: string) => mediaList.filter(m => getMediaType(m.key) === t).length;

  return (
    <>
      <Button icon={<CloudOutlined />} onClick={handleOpen} className="bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 font-bold">
        R2 资产库
      </Button>

      <Modal
        title={
          <div className="flex justify-between items-center pr-8">
            <div className="flex items-center gap-3 text-blue-600">
              <CloudOutlined className="text-xl" />
              <span className="font-bold">R2 云端资产库</span>
              <span className="text-xs text-gray-400 font-normal">
                {mediaList.length} 个文件 · {countByType('image')}图/{countByType('audio')}音/{countByType('video')}视
              </span>
              <div className="flex gap-1 ml-2">
                <Button
                  size="small"
                  type={isBatchMode ? 'primary' : 'default'}
                  onClick={() => { setIsBatchMode(!isBatchMode); setSelectedKeys([]); }}
                >
                  {isBatchMode ? '退出批量' : '批量管理'}
                </Button>
                {isBatchMode && selectedKeys.length > 0 && (
                  <Popconfirm
                    title={`确定删除选中的 ${selectedKeys.length} 个文件？`}
                    onConfirm={handleBatchDelete}
                    okText="确认删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除 ({selectedKeys.length})
                    </Button>
                  </Popconfirm>
                )}
              </div>
            </div>
            <Upload
              customRequest={handleUpload}
              showUploadList={false}
              accept="image/*,audio/*,video/*"
              multiple
            >
              <Button type="primary" icon={<UploadOutlined />} loading={activeUploads > 0} className="bg-blue-600">
                上传素材
              </Button>
            </Upload>
          </div>
        }
        open={isModalVisible}
        onCancel={() => { setIsModalVisible(false); setPreviewItem(null); }}
        footer={null}
        width={1100}
        styles={{ body: { padding: 0, height: '680px', display: 'flex', flexDirection: 'column' } }}

      >
        {/* ── Filter bar ── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0">
          {(['all', 'image', 'audio', 'video'] as MediaType[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-full border font-bold cursor-pointer transition-all ${
                typeFilter === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400'
              }`}
            >
              {t === 'all' ? `全部 (${mediaList.length})` : t === 'image' ? `🖼 图片 (${countByType('image')})` : t === 'audio' ? `🎵 音频 (${countByType('audio')})` : `🎬 视频 (${countByType('video')})`}
            </button>
          ))}
          <Button size="small" icon={<CloudOutlined />} onClick={() => fetchMedia(1)} loading={fetching} className="ml-auto text-gray-500">
            刷新
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Grid ── */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
            {fetching && mediaList.length === 0 ? (
              <div className="flex justify-center items-center h-full"><Spin size="large" /></div>
            ) : filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <CloudOutlined className="text-5xl mb-3" />
                <span className="text-sm">{typeFilter === 'all' ? '资产库为空，快去上传吧' : `暂无${typeFilter === 'image' ? '图片' : typeFilter === 'audio' ? '音频' : '视频'}文件`}</span>
              </div>
            ) : (
              <>
                <div className={`grid gap-3 ${typeFilter === 'audio' ? 'grid-cols-1 max-w-2xl' : 'grid-cols-4 md:grid-cols-5 lg:grid-cols-6'}`}>
                  {filteredList.map(media => {
                    const mtype = getMediaType(media.key);
                    const cfg = TYPE_CONFIG[mtype] || TYPE_CONFIG.other;
                    const isSelected = selectedKeys.includes(media.key);
                    const isActive = previewItem?.key === media.key;

                    if (mtype === 'audio') {
                      return (
                        <div key={media.key}
                          className={`flex items-center gap-3 p-3 rounded-xl border bg-white shadow-sm cursor-pointer transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-500' : isActive ? 'border-purple-400 ring-1 ring-purple-300' : 'border-gray-200 hover:border-purple-300'}`}
                          onClick={() => isBatchMode ? toggleSelection(media.key) : setPreviewItem(media)}
                        >
                          {isBatchMode && (
                            <div className={`w-5 h-5 rounded-sm border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                              {isSelected && <span className="text-white text-xs">✓</span>}
                            </div>
                          )}
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <SoundOutlined className="text-purple-600 text-lg" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 truncate">{getDisplayName(media.key)}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Tag color="purple" className="text-[10px] m-0 border-0 px-1">{formatSize(media.size)}</Tag>
                              {media.last_modified && <span className="text-[10px] text-gray-400">{new Date(media.last_modified).toLocaleDateString()}</span>}
                            </div>
                            {isActive && (
                              <audio src={media.url} controls className="w-full mt-2" style={{ height: '28px' }} />
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyUrl(media.url)} className="text-gray-400 hover:text-purple-500" title="复制链接" />
                            <a href={media.url} download>
                              <Button size="small" type="text" icon={<DownloadOutlined />} className="text-gray-400 hover:text-green-500" title="下载" />
                            </a>
                            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(media.key)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} className="text-gray-300 hover:text-red-500" title="删除" />
                            </Popconfirm>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={media.key}
                        className={`rounded-xl border overflow-hidden shadow-sm transition-all cursor-pointer bg-white ${isSelected ? 'border-blue-500 ring-2 ring-blue-500' : isActive ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'}`}
                        onClick={() => isBatchMode ? toggleSelection(media.key) : setPreviewItem(media)}
                      >
                        {/* Thumbnail */}
                        <div className="aspect-square bg-gray-100 flex items-center justify-center relative group overflow-hidden">
                          {mtype === 'image' ? (
                            <img src={media.url} alt={media.key} className="w-full h-full object-cover" />
                          ) : mtype === 'video' ? (
                            <>
                              <video src={media.url} className="w-full h-full object-cover" preload="metadata" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow">
                                  <VideoCameraOutlined className="text-green-600 text-sm" />
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center text-gray-400">
                              {cfg.icon}
                              <span className="text-[10px] mt-1">{cfg.label}</span>
                            </div>
                          )}

                          {/* Batch checkbox */}
                          {isBatchMode && (
                            <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-400 group-hover:border-blue-400'}`}>
                              {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                            </div>
                          )}

                          {/* Type badge */}
                          <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${mtype === 'image' ? 'bg-blue-500/80 text-white' : mtype === 'video' ? 'bg-green-500/80 text-white' : 'bg-purple-500/80 text-white'}`}>
                            {cfg.label}
                          </div>

                          {/* Hover actions */}
                          {!isBatchMode && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <Button shape="circle" icon={<EyeOutlined />} size="small" onClick={() => setPreviewItem(media)} title="预览" />
                              <Button shape="circle" icon={<CopyOutlined />} size="small" onClick={() => copyUrl(media.url)} title="复制链接" />
                              <a href={`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(media.url)}`} download>
                                <Button shape="circle" icon={<DownloadOutlined />} size="small" title="下载" />
                              </a>
                              <Popconfirm title="确定要删除吗？" onConfirm={() => handleDelete(media.key)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                                <Button shape="circle" danger icon={<DeleteOutlined />} size="small" title="删除" />
                              </Popconfirm>
                            </div>
                          )}
                        </div>

                        {/* Card body */}
                        <div className="p-2">
                          {renamingKey === media.key ? (
                            <div className="flex flex-col gap-1">
                              <Input
                                size="small"
                                defaultValue={getDisplayName(media.key).split('.')[0]}
                                onChange={e => setNewName(e.target.value)}
                                onPressEnter={() => handleRename(media.key)}
                                autoFocus
                              />
                              <div className="flex justify-between">
                                <Button size="small" onClick={() => setRenamingKey(null)}>取消</Button>
                                <Button size="small" type="primary" onClick={() => handleRename(media.key)}>保存</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[10px] text-gray-600 truncate flex-1" title={getDisplayName(media.key)}>
                                {getDisplayName(media.key)}
                              </span>
                              <EditOutlined
                                className="text-gray-300 hover:text-blue-500 cursor-pointer text-[10px] flex-shrink-0 mt-0.5"
                                onClick={e => { e.stopPropagation(); setRenamingKey(media.key); setNewName(getDisplayName(media.key).split('.')[0]); }}
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <Tag color={cfg.color as any} className="text-[9px] m-0 border-0 px-1 leading-4">{formatSize(media.size)}</Tag>
                            {media.last_modified && <span className="text-[9px] text-gray-400">{new Date(media.last_modified).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="text-center mt-6 pb-4">
                    <Button loading={fetching} onClick={() => fetchMedia(page + 1, true)} className="w-40 font-bold text-blue-600 border-blue-200">
                      加载更多
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Preview panel ── */}
          {previewItem && !isBatchMode && (
            <div className="w-72 border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700">预览</span>
                <Button type="text" size="small" onClick={() => setPreviewItem(null)} className="text-gray-400">✕</Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {/* Media preview */}
                {getMediaType(previewItem.key) === 'image' && (
                  <img src={previewItem.url} alt={previewItem.key} className="w-full rounded-lg border border-gray-200 mb-3" />
                )}
                {getMediaType(previewItem.key) === 'video' && (
                  <video src={previewItem.url} controls className="w-full rounded-lg mb-3" />
                )}
                {getMediaType(previewItem.key) === 'audio' && (
                  <div className="bg-purple-50 rounded-lg p-4 flex flex-col items-center mb-3 border border-purple-100">
                    <SoundOutlined className="text-purple-500 text-4xl mb-2" />
                    <audio src={previewItem.url} controls className="w-full mt-1" />
                  </div>
                )}

                {/* Meta */}
                <div className="text-xs text-gray-600 space-y-2">
                  <div className="font-bold text-gray-800 break-all">{getDisplayName(previewItem.key)}</div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">类型</span>
                    <Tag color={TYPE_CONFIG[getMediaType(previewItem.key)]?.color as any} className="text-[10px] m-0">
                      {TYPE_CONFIG[getMediaType(previewItem.key)]?.label}
                    </Tag>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">大小</span>
                    <span>{formatSize(previewItem.size)}</span>
                  </div>
                  {previewItem.last_modified && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">修改时间</span>
                      <span>{new Date(previewItem.last_modified).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="pt-1">
                    <div className="text-gray-500 mb-1">链接</div>
                    <div className="bg-gray-100 rounded p-1.5 text-[10px] text-gray-600 break-all leading-4">{previewItem.url}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 mt-4">
                  <Button
                    icon={<CopyOutlined />}
                    size="small"
                    onClick={() => copyUrl(previewItem.url)}
                    className="w-full text-blue-600 border-blue-200 bg-blue-50"
                  >
                    复制链接
                  </Button>
                  <a href={`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(previewItem.url)}`} download>
                    <Button icon={<DownloadOutlined />} size="small" className="w-full text-green-600 border-green-200 bg-green-50">
                      下载文件
                    </Button>
                  </a>
                  <Popconfirm title="确定要删除这个文件吗？" onConfirm={() => { handleDelete(previewItem.key); setPreviewItem(null); }} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                    <Button danger icon={<DeleteOutlined />} size="small" className="w-full">
                      删除文件
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
