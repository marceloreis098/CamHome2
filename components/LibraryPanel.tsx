import React, { useEffect, useState } from 'react';
import { RecordedMedia } from '../types';
import { fetchRecordings } from '../services/mockCameraService';
import { PhotoIcon, SparklesIcon, TagIcon, XMarkIcon } from './Icons';

const LibraryPanel: React.FC = () => {
  const [media, setMedia] = useState<RecordedMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  
  // Video Playback State
  const [selectedVideo, setSelectedVideo] = useState<RecordedMedia | null>(null);

  useEffect(() => {
    fetchRecordings().then(data => {
      setMedia(data);
      setLoading(false);
    });
  }, []);

  const filteredMedia = media.filter(item => 
    item.cameraName.toLowerCase().includes(filter.toLowerCase()) || 
    item.aiTags.some(tag => tag.toLowerCase().includes(filter.toLowerCase()))
  );

  // Helper to handle smart URLs in dev/prod
  const getFullUrl = (url: string) => {
    if (!url) return '';
    const isDev = process.env.NODE_ENV === 'development' || window.location.port === '1234';
    return isDev ? `http://${window.location.hostname}:3000${url}` : url;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-white flex items-center gap-2">
             <PhotoIcon className="w-8 h-8 text-orange-500" />
             Biblioteca de Gravações
           </h2>
           <p className="text-gray-400 text-sm mt-1">
             Arquivo de eventos capturados. Clique para assistir.
           </p>
        </div>
        <div>
          <input 
            type="text" 
            placeholder="Buscar por tag ou câmera..." 
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 w-full md:w-64 focus:outline-none focus:border-orange-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
           <div className="w-8 h-8 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredMedia.map(item => (
            <div 
                key={item.id} 
                className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-lg group cursor-pointer hover:border-orange-500 transition-colors"
                onClick={() => setSelectedVideo(item)}
            >
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <img 
                    src={getFullUrl(item.thumbnailUrl)} 
                    alt="Recording" 
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                    onError={(e) => {
                        // Fallback to generic icon if thumb not ready
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
                
                {/* Fallback Icon behind img */}
                <div className="absolute inset-0 flex items-center justify-center z-0">
                    <span className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[16px] border-l-white border-b-[8px] border-b-transparent ml-1"></div>
                    </span>
                </div>

                <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-xs text-white backdrop-blur-sm z-10">
                  {item.cameraName}
                </div>
                <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-xs text-gray-300 backdrop-blur-sm font-mono z-10">
                  {item.timestamp.toLocaleDateString('pt-BR')}
                </div>
                <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-gray-300 backdrop-blur-sm z-10">
                  {item.timestamp.toLocaleTimeString('pt-BR')} • {item.size || 'N/A'}
                </div>
              </div>
              
              <div className="p-4">
                 <h3 className="text-sm font-semibold text-white mb-1 truncate">
                    {item.id}
                 </h3>
                 <div className="flex gap-2">
                    <span className="text-xs text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded">Vídeo Gravado</span>
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredMedia.length === 0 && !loading && (
        <div className="text-center py-20 text-gray-500">
          Nenhuma gravação encontrada. O sistema grava segmentos a cada 10 minutos.
        </div>
      )}

      {/* VIDEO PLAYER MODAL */}
      {selectedVideo && (
         <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <div className="relative w-full max-w-4xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-800">
                    <div>
                        <h3 className="text-white font-bold">{selectedVideo.cameraName}</h3>
                        <p className="text-xs text-gray-400">{selectedVideo.timestamp.toLocaleString('pt-BR')}</p>
                    </div>
                    <button onClick={() => setSelectedVideo(null)} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="aspect-video bg-black relative">
                    {/* The video tag automatically uses the browser's native controls */}
                    <video 
                        src={getFullUrl(selectedVideo.videoUrl || '')} 
                        controls 
                        autoPlay 
                        className="w-full h-full"
                    >
                        Seu navegador não suporta a tag de vídeo.
                    </video>
                </div>

                <div className="p-4 bg-gray-900 flex justify-end gap-2">
                    <a 
                        href={getFullUrl(selectedVideo.videoUrl || '')} 
                        download 
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                    >
                        Baixar Arquivo
                    </a>
                </div>
            </div>
         </div>
      )}

    </div>
  );
};

export default LibraryPanel;