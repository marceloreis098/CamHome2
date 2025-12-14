import React, { useState, useEffect } from 'react';
import { SystemNotification, NotificationLevel } from '../types';
import { BellIcon, CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from './Icons';

interface NotificationSystemProps {
  notifications: SystemNotification[];
  minAlertLevel: NotificationLevel;
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({ 
  notifications, 
  minAlertLevel,
  onMarkAsRead,
  onClearAll
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeToasts, setActiveToasts] = useState<SystemNotification[]>([]);
  
  // Track previous notifications to detect new ones for toasts
  const [prevNotifsLength, setPrevNotifsLength] = useState(notifications.length);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Levels hierarchy for filtering
  const levelPriority = {
    [NotificationLevel.INFO]: 0,
    [NotificationLevel.WARNING]: 1,
    [NotificationLevel.CRITICAL]: 2
  };

  useEffect(() => {
    if (notifications.length > prevNotifsLength) {
      // Find new notifications
      const newItems = notifications.slice(0, notifications.length - prevNotifsLength);
      
      // Filter based on settings
      const relevantItems = newItems.filter(item => 
        levelPriority[item.level] >= levelPriority[minAlertLevel]
      );

      // Add to toasts
      if (relevantItems.length > 0) {
        setActiveToasts(prev => [...relevantItems, ...prev]);
        
        // Auto remove toast after 5 seconds
        setTimeout(() => {
          setActiveToasts(prev => prev.filter(t => !relevantItems.includes(t)));
        }, 5000);
      }
    }
    setPrevNotifsLength(notifications.length);
  }, [notifications, minAlertLevel, prevNotifsLength]);

  const removeToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
    onMarkAsRead(id);
  };

  const getLevelColor = (level: NotificationLevel) => {
    switch(level) {
      case NotificationLevel.CRITICAL: return 'text-red-500 border-red-500 bg-red-900/10';
      case NotificationLevel.WARNING: return 'text-yellow-500 border-yellow-500 bg-yellow-900/10';
      default: return 'text-blue-400 border-blue-400 bg-blue-900/10';
    }
  };

  const getLevelBadge = (level: NotificationLevel) => {
    switch(level) {
      case NotificationLevel.CRITICAL: return 'bg-red-500 text-white';
      case NotificationLevel.WARNING: return 'bg-yellow-500 text-black';
      default: return 'bg-blue-500 text-white';
    }
  };

  return (
    <>
      {/* 1. Navbar Icon & Dropdown */}
      <div className="relative">
        <button 
          className="relative p-2 rounded-full hover:bg-gray-800 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <BellIcon className={`w-6 h-6 ${unreadCount > 0 ? 'text-white' : 'text-gray-400'}`} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 rounded-full text-[10px] flex items-center justify-center font-bold text-white border-2 border-gray-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40 cursor-default" 
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
               <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                 <h3 className="font-bold text-white text-sm">Notificações</h3>
                 {unreadCount > 0 && (
                   <button onClick={onClearAll} className="text-xs text-blue-400 hover:text-blue-300">
                     Marcar todas como lidas
                   </button>
                 )}
               </div>
               
               <div className="max-h-80 overflow-y-auto">
                 {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      Sem notificações recentes.
                    </div>
                 ) : (
                   notifications.map(notif => (
                     <div 
                        key={notif.id} 
                        className={`p-3 border-b border-gray-700/50 hover:bg-gray-700/50 transition-colors cursor-pointer ${notif.read ? 'opacity-60' : 'bg-gray-700/20'}`}
                        onClick={() => onMarkAsRead(notif.id)}
                     >
                        <div className="flex justify-between items-start mb-1">
                           <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${getLevelBadge(notif.level)}`}>
                             {notif.level}
                           </span>
                           <span className="text-[10px] text-gray-400">
                             {notif.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </span>
                        </div>
                        <h4 className={`text-sm font-semibold mb-0.5 ${notif.read ? 'text-gray-300' : 'text-white'}`}>{notif.title}</h4>
                        <p className="text-xs text-gray-400 leading-snug">{notif.message}</p>
                     </div>
                   ))
                 )}
               </div>
            </div>
          </>
        )}
      </div>

      {/* 2. Toast Container (Floating) */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
        {activeToasts.map(toast => (
          <div 
            key={toast.id}
            className={`pointer-events-auto w-80 bg-gray-900 border-l-4 rounded-lg shadow-2xl p-4 flex gap-3 transform transition-all duration-300 animate-slide-in ${getLevelColor(toast.level)}`}
          >
             <div className="shrink-0 pt-0.5">
                {toast.level === NotificationLevel.CRITICAL ? (
                   <ExclamationCircleIcon className="w-5 h-5" />
                ) : (
                   <CheckCircleIcon className="w-5 h-5" />
                )}
             </div>
             <div className="flex-1">
                <h4 className="font-bold text-sm text-white">{toast.title}</h4>
                <p className="text-xs text-gray-300 mt-0.5">{toast.message}</p>
             </div>
             <button onClick={() => removeToast(toast.id)} className="shrink-0 text-gray-500 hover:text-white">
                <XMarkIcon className="w-4 h-4" />
             </button>
          </div>
        ))}
      </div>
      
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
};

export default NotificationSystem;