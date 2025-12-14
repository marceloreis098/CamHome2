import React, { useEffect, useState } from 'react';
import { RecordedMedia } from '../types';
import { fetchRecordings } from '../services/mockCameraService';
import { SparklesIcon, FileIcon, FilterIcon, CalendarIcon, CameraIcon } from './Icons';
import { jsPDF } from "jspdf";

const ReportsPanel: React.FC = () => {
  const [media, setMedia] = useState<RecordedMedia[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('all');

  useEffect(() => {
    fetchRecordings().then(data => {
      setMedia(data);
      setLoading(false);
    });
  }, []);

  // Filter Logic
  const filteredMedia = media.filter(item => {
    // Date Filter
    if (startDate) {
       const start = new Date(startDate);
       start.setHours(0,0,0,0);
       if (new Date(item.timestamp) < start) return false;
    }
    if (endDate) {
       const end = new Date(endDate);
       end.setHours(23,59,59,999);
       if (new Date(item.timestamp) > end) return false;
    }
    // Camera Filter
    if (selectedCamera !== 'all' && item.cameraName !== selectedCamera) {
       return false;
    }
    return true;
  });

  // Get unique camera names for the dropdown
  const uniqueCameras = Array.from(new Set(media.map(m => m.cameraName)));

  const stats = {
    total: filteredMedia.length,
    people: filteredMedia.filter(m => m.aiTags.some(t => t.toLowerCase().includes('pessoa'))).length,
    vehicles: filteredMedia.filter(m => m.aiTags.some(t => t.toLowerCase().includes('veículo') || t.toLowerCase().includes('carro'))).length,
    suspicious: filteredMedia.filter(m => m.aiTags.some(t => ['tocando', 'portão', 'calçada', 'suspeito'].some(k => t.toLowerCase().includes(k)))).length
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(234, 88, 12); // Orange-600
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Relatório de Segurança - CamHome", 10, 12);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 10, 30);
    
    // Add Filter Context to PDF
    let filterText = "Filtro: Todos os eventos";
    if (startDate || endDate || selectedCamera !== 'all') {
      filterText = `Filtro: ${startDate || 'Início'} até ${endDate || 'Hoje'} | Câmera: ${selectedCamera === 'all' ? 'Todas' : selectedCamera}`;
    }
    doc.setTextColor(100, 100, 100);
    doc.text(filterText, 10, 35);
    doc.setTextColor(0,0,0);

    // Summary
    doc.setFontSize(14);
    doc.text("Resumo de Atividades", 10, 45);
    doc.setFontSize(10);
    doc.text(`Total de Eventos: ${stats.total}`, 10, 55);
    doc.text(`Pessoas Detectadas: ${stats.people}`, 10, 60);
    doc.text(`Veículos Detectados: ${stats.vehicles}`, 10, 65);
    doc.text(`Comportamentos de Atenção: ${stats.suspicious}`, 10, 70);

    // Detailed List
    let y = 85;
    doc.setFontSize(14);
    doc.text("Detalhamento dos Eventos", 10, y);
    y += 10;

    filteredMedia.forEach((item, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      
      const timeStr = new Date(item.timestamp).toLocaleString('pt-BR');
      const tagsStr = item.aiTags.join(', ');
      const identification = item.userTags && item.userTags.length > 0 ? `Identificado: ${item.userTags.join(', ')}` : "Não Identificado (Requer análise)";

      doc.setDrawColor(200, 200, 200);
      doc.line(10, y, pageWidth - 10, y);
      y += 10;

      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(`Evento #${index + 1} - ${item.cameraName}`, 10, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Hora: ${timeStr}`, 10, y);
      y += 6;
      doc.text(`Análise IA: ${tagsStr}`, 10, y);
      y += 6;
      doc.setTextColor(234, 88, 12); // Orange
      doc.text(identification, 10, y);
      y += 10;
    });

    doc.save("relatorio_seguranca.pdf");
  };

  if (loading) return <div className="text-white text-center py-10">Carregando dados para relatório...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <SparklesIcon className="w-8 h-8 text-orange-500" />
            Relatórios Inteligentes
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Gere relatórios PDF detalhados baseados em períodos e câmeras.
          </p>
        </div>
        <button 
          onClick={generatePDF}
          className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold shadow-lg shadow-orange-600/20 flex items-center gap-2"
        >
          <FileIcon className="w-5 h-5" />
          Exportar Relatório PDF
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-auto">
          <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> Data Início</label>
          <input 
            type="date" 
            className="bg-gray-900 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="w-full md:w-auto">
          <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> Data Fim</label>
          <input 
            type="date" 
            className="bg-gray-900 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="w-full md:w-auto flex-1">
           <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><CameraIcon className="w-3 h-3"/> Câmera</label>
           <select 
             className="bg-gray-900 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5"
             value={selectedCamera}
             onChange={(e) => setSelectedCamera(e.target.value)}
           >
             <option value="all">Todas as Câmeras</option>
             {uniqueCameras.map(cam => (
               <option key={cam} value={cam}>{cam}</option>
             ))}
           </select>
        </div>
        <div className="w-full md:w-auto pb-1 text-gray-500 text-xs italic">
           <span className="flex items-center gap-1"><FilterIcon className="w-3 h-3"/> Mostrando {filteredMedia.length} eventos</span>
        </div>
      </div>

      {/* Stats Cards (Dynamic based on filter) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
           <h3 className="text-gray-400 text-xs uppercase tracking-wider">Eventos Filtrados</h3>
           <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
           <h3 className="text-blue-400 text-xs uppercase tracking-wider">Pessoas</h3>
           <p className="text-3xl font-bold text-white mt-1">{stats.people}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
           <h3 className="text-green-400 text-xs uppercase tracking-wider">Veículos</h3>
           <p className="text-3xl font-bold text-white mt-1">{stats.vehicles}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-red-500/50 bg-red-900/10">
           <h3 className="text-red-400 text-xs uppercase tracking-wider">Atenção Necessária</h3>
           <p className="text-3xl font-bold text-white mt-1">{stats.suspicious}</p>
           <p className="text-[10px] text-gray-500 mt-1">Portão, Carro, Calçada</p>
        </div>
      </div>

      {/* Detailed List */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Detalhamento (Visualização)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-3">Snapshot</th>
                <th className="px-6 py-3">Câmera / Hora</th>
                <th className="px-6 py-3">Análise IA (Comportamento)</th>
                <th className="px-6 py-3">Identificação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredMedia.map((item) => (
                <tr key={item.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4">
                    <img src={item.thumbnailUrl} alt="Snap" className="h-12 w-20 object-cover rounded border border-gray-600" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{item.cameraName}</div>
                    <div className="text-xs font-mono">{item.timestamp.toLocaleString('pt-BR')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {item.aiTags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded bg-gray-700 border border-gray-600 text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {item.userTags && item.userTags.length > 0 ? (
                      <span className="text-green-400 font-semibold">{item.userTags.join(', ')}</span>
                    ) : (
                      <span className="text-yellow-500 text-xs italic bg-yellow-900/20 px-2 py-1 rounded">Requer Identificação</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredMedia.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Nenhum evento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPanel;