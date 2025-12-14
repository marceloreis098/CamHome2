import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraStatus } from '../types';
import { SignalIcon, SparklesIcon, PhotoIcon, ExclamationCircleIcon } from './Icons';
import { analyzeFrame } from '../services/geminiService';

interface CameraCardProps {
  camera: Camera;
}

const CameraCard: React.FC<CameraCardProps> = ({ camera }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  
  // Refresh mechanism for Live View (simulating video via snapshots)
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLive) {
        // Refresh every 5 seconds to prevent overwhelming the server FFMPEG process
        // RTSP snapshots are heavy operations.
        interval = setInterval(() => {
            setRefreshTrigger(prev => prev + 1);
            setImgStatus('loading');
        }, 5000);
    }
    return () => clearInterval(interval);
  }, [isLive, retryCount]);

  // Use the Backend Proxy to fetch images. 
  // This solves CORS issues and Credential stripping by browsers.
  const getProxyUrl = () => {
      if (!camera.thumbnailUrl) return '';
      
      // Determine base URL (handle dev vs prod)
      const isDev = process.env.NODE_ENV === 'development' || window.location.port === '1234';
      const baseUrl = isDev ? `http://${window.location.hostname}:3000` : '';
      
      const params = new URLSearchParams();
      
      // Handle RTSP vs HTTP
      let endpoint = '/api/proxy';
      if (camera.thumbnailUrl.trim().toLowerCase().startsWith('rtsp://')) {
          endpoint = '/api/rtsp-snapshot';
          // For RTSP, user/pass are usually embedded in URL, but we append just in case logic needs it
          let finalUrl = camera.thumbnailUrl;
          if (camera.username && camera.password && !finalUrl.includes('@')) {
              // Insert credentials if missing
              finalUrl = finalUrl.replace('rtsp://', `rtsp://${camera.username}:${camera.password}@`);
          }
          params.append('url', finalUrl);
      } else {
          // Standard HTTP/HTTPS
          params.append('url', camera.thumbnailUrl);
          if (camera.username) params.append('username', camera.username);
          if (camera.password) params.append('password', camera.password);
      }
      
      // Cache buster
      params.append('_t', refreshTrigger.toString());

      return `${baseUrl}${endpoint}?${params.toString()}`;
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);
    
    // We can fetch the proxy URL directly to get the blob for analysis
    try {
        const proxyUrl = getProxyUrl();
        const response = await fetch(proxyUrl);
        const blob = await response.blob();
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            const result = await analyzeFrame(base64);
            setAnalysis(result);
            setIsAnalyzing(false);
        };
        reader.readAsDataURL(blob);
    } catch (e) {
      setAnalysis("Não foi possível capturar o frame para análise. Verifique se a câmera está online.");
      setIsAnalyzing(false);
    }
  };

  const handleSnapshot = () => {
    const link = document.createElement('a');
    link.href = getProxyUrl(); // Download from proxy to ensure auth works
    link.download = `${camera.name.replace(/\s+/g, '_')}_${new Date().getTime()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 bg-gray-800 flex justify-between items-center border-b border-gray-700">
        <div>
          <h3 className="font-semibold text-white truncate max-w-[150px]" title={camera.name}>{camera.name}</h3>
          <p className="text-xs text-gray-400 font-mono truncate max-w-[150px]">{camera.ip}</p>
        </div>
        <div className="flex items-center gap-2">
          {isLive && imgStatus === 'loaded' && (
             <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
             </span>
          )}
          <SignalIcon className={`w-5 h-5 ${imgStatus === 'error' ? 'text-red-500' : 'text-green-500'}`} />
        </div>
      </div>

      {/* Feed Area */}
      <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden group">
        <img 
          src={getProxyUrl()} 
          alt={camera.name} 
          className={`w-full h-full object-cover transition-opacity duration-500 ${imgStatus === 'loaded' ? 'opacity-100' : 'opacity-40'}`}
          onError={(e) => {
             setImgStatus('error');
             // Do not stop live, let it retry on next interval
          }}
          onLoad={() => {
             setImgStatus('loaded');
          }}
        />
        
        {/* Loading Overlay */}
        {isLive && imgStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 border-4 border-transparent border-t-orange-500 rounded-full animate-spin"></div>
            </div>
        )}

        {/* Error Overlay */}
        {imgStatus === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60 p-6 text-center backdrop-blur-sm">
                <ExclamationCircleIcon className="w-8 h-8 text-red-400 mb-2 animate-pulse" />
                <p className="text-white font-bold text-xs">Conexão Instável</p>
                <p className="text-[10px] text-gray-300 mt-1">Tentando reconectar...</p>
            </div>
        )}

        {/* Controls Overlay (Hover) */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
            <button 
                onClick={handleSnapshot}
                className="bg-gray-800/80 p-2 rounded-full hover:bg-white hover:text-black text-white transition-all transform hover:scale-110"
                title="Tirar Foto"
            >
                <PhotoIcon className="w-5 h-5" />
            </button>
            <button 
                 onClick={handleAnalyze}
                 disabled={isAnalyzing}
                 className="bg-indigo-600/80 p-2 rounded-full hover:bg-indigo-500 text-white transition-all transform hover:scale-110 disabled:opacity-50"
                 title="Analisar com IA"
            >
                {isAnalyzing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <SparklesIcon className="w-5 h-5" />}
            </button>
        </div>

        {/* Status Badge */}
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs text-white font-mono flex items-center gap-2">
           <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
           {isLive ? 'AO VIVO' : 'PAUSADO'}
        </div>
      </div>

      {/* Analysis Result Box */}
      {analysis && (
        <div className="p-3 bg-indigo-900/40 border-t border-indigo-500/30 flex-1 min-h-[80px]">
          <div className="flex justify-between items-start mb-1">
             <h4 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                <SparklesIcon className="w-3 h-3" /> Insight IA
             </h4>
             <button onClick={() => setAnalysis(null)} className="text-[10px] text-indigo-400 hover:text-white">Fechar</button>
          </div>
          <p className="text-xs text-indigo-100 leading-relaxed overflow-y-auto max-h-[100px]">
            {analysis}
          </p>
        </div>
      )}

      {/* Footer Controls */}
      {!analysis && (
          <div className="p-3 bg-gray-900 border-t border-gray-800 flex items-center justify-between gap-3 mt-auto">
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                {imgStatus === 'loading' ? 'Atualizando...' : imgStatus === 'error' ? 'Falha' : 'Online'}
              </span>
              <button 
                onClick={() => setIsLive(!isLive)} 
                className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${isLive ? 'border-gray-700 text-gray-400 hover:text-white' : 'bg-green-600 border-green-600 text-white hover:bg-green-500'}`}
              >
                  {isLive ? 'PAUSAR' : 'RECONECTAR'}
              </button>
          </div>
      )}
    </div>
  );
};

export default CameraCard;