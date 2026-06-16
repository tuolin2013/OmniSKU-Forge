// frontend/src/components/R2GalleryManager.tsx
import React, { useState, useEffect } from 'react';
import { Modal, Button, message, Upload, Card, Input, Spin, Dropdown, Menu, Popconfirm, Tag } from 'antd';
import { 
  CloudOutlined, UploadOutlined, DeleteOutlined, 
  EditOutlined, EllipsisOutlined, EyeOutlined 
} from '@ant-design/icons';

interface MediaItem {
  url: string;
  key: string;
  size: number;
  last_modified: string;
}

export default function R2GalleryManager() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [activeUploads, setActiveUploads] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);

  const fetchImages = async (pageNum: number, append: boolean = false) => {
    setFetching(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/v1/r2/images?page=${pageNum}&limit=20`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.code === 200) {
        if (append) {
          setMediaList(prev => [...prev, ...data.data.media]);
        } else {
          setMediaList(data.data.media);
        }
        setHasMore(data.data.has_more);
        setPage(pageNum);
      }
    } catch (err: any) {
      message.error(`获取图库失败: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleOpen = () => {
    setIsModalVisible(true);
    if (mediaList.length === 0) fetchImages(1);
  };

  const handleUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    setActiveUploads(prev => prev + 1);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/r2/upload', { method: 'POST', body: formData });
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
          fetchImages(1); // 所有文件上传完毕后统一刷新一次
        }
        return next;
      });
    }
  };

  const handleDelete = async (fileKey: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/r2/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_key: fileKey })
      });
      const data = await res.json();
      if (data.code === 200) {
        message.success('删除成功');
        setMediaList(prev => prev.filter(m => m.key !== fileKey));
        setSelectedKeys(prev => prev.filter(k => k !== fileKey));
      } else {
        message.error(`删除失败: ${data.message}`);
      }
    } catch (err) {
      message.error('请求失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedKeys.length === 0) return;
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/r2/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_keys: selectedKeys })
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
    } catch (err) {
      message.error('请求失败');
    }
  };

  const toggleSelection = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleRename = async (fileKey: string) => {
    if (!newName.trim()) return message.warning('名称不能为空');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/r2/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_key: fileKey, new_name: newName.trim() })
      });
      const data = await res.json();
      if (data.code === 200) {
        message.success('重命名成功');
        setRenamingKey(null);
        setNewName("");
        // 简单更新本地状态
        setMediaList(prev => prev.map(m => {
          if (m.key === fileKey) {
            return { ...m, key: data.data.new_key, url: data.data.new_url };
          }
          return m;
        }));
      } else {
        message.error(`重命名失败: ${data.message}`);
      }
    } catch (err) {
      message.error('请求失败');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  // Helper to extract a display name from the key
  const getDisplayName = (key: string) => {
    const parts = key.split('/');
    return parts[parts.length - 1];
  };

  return (
    <>
      <Button icon={<CloudOutlined />} onClick={handleOpen} className="bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 font-bold">
        R2图库管理
      </Button>

      <Modal
        title={
          <div className="flex justify-between items-center pr-8">
            <div className="flex items-center text-blue-600">
              <CloudOutlined className="mr-2 text-xl"/> R2 云端资产库
              <div className="ml-8 flex gap-2">
                <Button 
                  size="small" 
                  type={isBatchMode ? "primary" : "default"}
                  onClick={() => {
                    setIsBatchMode(!isBatchMode);
                    if (isBatchMode) setSelectedKeys([]); // exit batch mode clears selection
                  }}
                >
                  {isBatchMode ? "退出批量操作" : "批量管理"}
                </Button>
                {isBatchMode && selectedKeys.length > 0 && (
                  <Popconfirm 
                    title={`确定要删除选中的 ${selectedKeys.length} 个文件吗？`} 
                    onConfirm={handleBatchDelete} 
                    okText="确认删除" 
                    cancelText="取消" 
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>删除选中 ({selectedKeys.length})</Button>
                  </Popconfirm>
                )}
              </div>
            </div>
            <Upload customRequest={handleUpload} showUploadList={false} accept="image/*" multiple>
              <Button type="primary" icon={<UploadOutlined />} loading={activeUploads > 0} className="bg-blue-600">上传素材</Button>
            </Upload>
          </div>
        }
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={1000}
        bodyStyle={{ padding: '0', height: '600px', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {fetching && mediaList.length === 0 ? (
            <div className="flex justify-center items-center h-full"><Spin size="large" /></div>
          ) : (
            <>
              <div className="grid grid-cols-4 md:grid-cols-5 gap-4">
                {mediaList.map((media) => (
                  <Card 
                    key={media.key}
                    hoverable
                    bodyStyle={{ padding: '8px' }}
                    className={`overflow-hidden shadow-sm transition-all ${selectedKeys.includes(media.key) ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200'}`}
                    cover={
                      <div 
                        className="aspect-square bg-gray-100 flex items-center justify-center relative group cursor-pointer"
                        onClick={() => isBatchMode ? toggleSelection(media.key) : window.open(media.url, '_blank')}
                      >
                        <img src={media.url} alt={media.key} className="w-full h-full object-cover" />
                        
                        {/* Checkbox for batch mode */}
                        {isBatchMode && (
                          <div className={`absolute top-2 left-2 w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-colors
                            ${selectedKeys.includes(media.key) ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-400 group-hover:border-blue-400'}`}>
                            {selectedKeys.includes(media.key) && <span className="text-white text-xs leading-none">✓</span>}
                          </div>
                        )}

                        {!isBatchMode && (
                          <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button shape="circle" icon={<EyeOutlined />} size="small" onClick={() => window.open(media.url, '_blank')} />
                            <Popconfirm title="确定要删除这个文件吗？" onConfirm={() => handleDelete(media.key)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                              <Button shape="circle" danger icon={<DeleteOutlined />} size="small" />
                            </Popconfirm>
                          </div>
                        )}
                      </div>
                    }
                  >
                    {renamingKey === media.key ? (
                      <div className="flex flex-col gap-2">
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
                      <div className="flex flex-col">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-medium text-gray-700 truncate block w-4/5" title={getDisplayName(media.key)}>
                            {getDisplayName(media.key)}
                          </span>
                          <EditOutlined className="text-gray-400 hover:text-blue-500 cursor-pointer text-xs" onClick={() => { setRenamingKey(media.key); setNewName(getDisplayName(media.key).split('.')[0]); }} />
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <Tag color="blue" className="text-[10px] m-0 border-0">{formatSize(media.size)}</Tag>
                          <span className="text-[10px] text-gray-400">{new Date(media.last_modified).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
              
              {hasMore && (
                <div className="text-center mt-8 pb-4">
                  <Button loading={fetching} onClick={() => fetchImages(page + 1, true)} className="w-48 font-bold text-blue-600 border-blue-200">
                    加载更多
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
