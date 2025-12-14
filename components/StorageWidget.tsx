import React from 'react';
import { StorageStats } from '../types';
import { HddIcon } from './Icons';

interface StorageWidgetProps {
  stats: StorageStats;
}

const StorageWidget: React.FC<StorageWidgetProps> = ({ stats }) => {
  const percentage = Math.round((stats.used / stats.total) * 100);
  const free = stats.total - stats.used;

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <HddIcon className="w-5 h-5 text-orange-500" />
          Armazenamento Local
        </h3>
        <span className={`text-xs px-2 py-1 rounded-full ${stats.isMounted ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {stats.isMounted ? 'MONTADO' : 'DESMONTADO'}
        </span>
      </div>
      
      <div className="mb-2 flex justify-between text-sm text-gray-400">
        <span>Usado: {stats.used} GB</span>
        <span>Total: {stats.total} GB</span>
      </div>

      <div className="w-full bg-gray-700 rounded-full h-4 mb-4 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-orange-600 to-orange-400 h-4 rounded-full transition-all duration-1000 ease-out" 
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-400">Caminho: <code className="text-gray-300 bg-gray-900 px-1 py-0.5 rounded">{stats.path}</code></span>
        <span className="font-bold text-orange-400">{free} GB Livre</span>
      </div>
    </div>
  );
};

export default StorageWidget;