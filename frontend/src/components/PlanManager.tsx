// frontend/src/components/PlanManager.tsx
/**
 * 策划案保存 / 加载管理器
 * ─ 满意后点「保存策划案」存到后端
 * ─ 下次启动选产品后，级联加载历史策划案
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

import React, { useEffect, useState, useCallback } from 'react';
import { Button, Select, Tooltip, Divider, message, Popconfirm, Tag } from 'antd';
import { SaveOutlined, FolderOpenOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

const { Option } = Select;

interface PlanMeta {
  id: string;
  platform: string;
  sku_name: string;
  title: string;
  created_at: string;
}

interface PlanManagerProps {
  platform: 'taobao' | 'pinduoduo';
  skuName: string;             // 当前已选产品名
  pmReport: string;            // 当前策划案内容
  onLoad: (report: string) => void; // 加载策划案回调
}

const PLATFORM_LABELS: Record<string, string> = {
  taobao: '淘宝',
  pinduoduo: '拼多多',
};

export default function PlanManager({ platform, skuName, pmReport, onLoad }: PlanManagerProps) {
  const [plans, setPlans] = useState<PlanMeta[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // 当 skuName 变化时自动拉取该产品的历史策划案
  const fetchPlans = useCallback(async () => {
    if (!skuName) {
      setPlans([]);
      setSelectedPlanId('');
      return;
    }
    setFetching(true);
    try {
      const params = new URLSearchParams({ platform, sku_name: skuName });
      const res = await fetch(`${API_BASE}/api/v1/plans?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PlanMeta[] = await res.json();
      setPlans(data);
      setSelectedPlanId('');
    } catch (e: any) {
      console.warn('加载策划案列表失败:', e.message);
    } finally {
      setFetching(false);
    }
  }, [platform, skuName]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // 保存当前策划案
  const handleSave = async () => {
    if (!skuName) return message.warning('请先选择产品！');
    if (!pmReport?.trim()) return message.warning('策划案内容为空，无法保存！');
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, sku_name: skuName, pm_report: pmReport }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved: PlanMeta = await res.json();
      message.success(`✅ 策划案已保存：${saved.title}`);
      await fetchPlans();
      setSelectedPlanId(saved.id);
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 加载选中的策划案
  const handleLoad = async () => {
    if (!selectedPlanId) return message.warning('请先从下拉列表选择一个策划案！');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/plans/${selectedPlanId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onLoad(data.pm_report);
      message.success(`📂 策划案「${data.title}」已加载！`);
    } catch (e: any) {
      message.error(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 删除策划案
  const handleDelete = async (planId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/plans/${planId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      message.success('已删除');
      if (selectedPlanId === planId) setSelectedPlanId('');
      await fetchPlans();
    } catch (e: any) {
      message.error(`删除失败: ${e.message}`);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1 text-sm font-semibold text-blue-700">
        <FolderOpenOutlined />
        <span>策划案存档</span>
        {skuName && (
          <Tag color="blue" className="ml-1 text-xs">{PLATFORM_LABELS[platform]} · {skuName}</Tag>
        )}
      </div>

      {/* 保存当前策划案 */}
      <div className="flex items-center gap-2">
        <Tooltip title="对当前策划案满意后点击保存，下次可直接加载">
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!pmReport?.trim() || !skuName}
            onClick={handleSave}
            className="shrink-0"
          >
            保存策划案
          </Button>
        </Tooltip>
        <span className="text-xs text-gray-400">满意后保存，下次直接加载</span>
      </div>

      {/* 加载历史策划案 */}
      {skuName && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            placeholder={fetching ? '加载中...' : plans.length === 0 ? '暂无历史策划案' : '选择历史策划案...'}
            size="small"
            style={{ minWidth: 260, flex: 1 }}
            value={selectedPlanId || undefined}
            onChange={setSelectedPlanId}
            loading={fetching}
            notFoundContent={fetching ? '加载中...' : '暂无历史策划案'}
            optionLabelProp="label"
          >
            {plans.map(plan => (
              <Option
                key={plan.id}
                value={plan.id}
                label={`${formatDate(plan.created_at)} · ${plan.sku_name}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-700 truncate">
                    {formatDate(plan.created_at)} · {plan.sku_name}
                  </span>
                  <Popconfirm
                    title="确认删除此策划案？"
                    onConfirm={(e) => { e?.stopPropagation(); handleDelete(plan.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="删除"
                    cancelText="取消"
                    placement="left"
                  >
                    <DeleteOutlined
                      className="text-red-400 hover:text-red-600 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
              </Option>
            ))}
          </Select>

          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            loading={loading}
            disabled={!selectedPlanId}
            onClick={handleLoad}
            type="default"
          >
            加载
          </Button>

          <Tooltip title="刷新策划案列表">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={fetching}
              onClick={fetchPlans}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
}
