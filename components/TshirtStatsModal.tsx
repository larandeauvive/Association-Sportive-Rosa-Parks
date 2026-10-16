import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { X, Shirt, Download, Printer, Search, CheckCircle2, User, ChevronRight } from 'lucide-react';
import { normalizeGender } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  activeYear: string;
  onOpenStudentSheet?: (student: Student) => void;
}

export const TshirtStatsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  students,
  activeYear,
  onOpenStudentSheet
}) => {
  const [selectedSizeFilter, setSelectedSizeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrer les élèves de l'année active
  const yearStudents = useMemo(() => {
    return students.filter(s => !s.schoolYear || s.schoolYear === activeYear);
  }, [students, activeYear]);

  // Élèves ayant commandé / demandé un T-shirt
  const tshirtStudents = useMemo(() => {
    return yearStudents.filter(s => {
      const t = String(s.tshirt || '').trim().toUpperCase();
      const hasSize = !!(s.size && s.size.trim() !== '');
      return t === 'OUI' || t === 'YES' || hasSize;
    });
  }, [yearStudents]);

  // Répartition par taille normalisée
  const sizeStats = useMemo(() => {
    const counts: Record<string, { count: number; students: Student[] }> = {};

    tshirtStudents.forEach(s => {
      let rawSize = (s.size || '').trim();
      if (!rawSize) {
        rawSize = 'Non précisée';
      } else {
        rawSize = rawSize.toUpperCase();
      }

      if (!counts[rawSize]) {
        counts[rawSize] = { count: 0, students: [] };
      }
      counts[rawSize].count++;
      counts[rawSize].students.push(s);
    });

    // Ordre standard pour les tailles habituelles
    const order = ['10 ANS', '12 ANS', '14 ANS', '16 ANS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'NON PRÉCISÉE'];
    const sortedKeys = Object.keys(counts).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.map(size => ({
      size,
      count: counts[size].count,
      students: counts[size].students,
      percentage: tshirtStudents.length > 0 ? Math.round((counts[size].count / tshirtStudents.length) * 100) : 0
    }));
  }, [tshirtStudents]);

  // Filtrage pour la liste affichée dans la modale
  const displayedStudents = useMemo(() => {
    return tshirtStudents.filter(s => {
      const sizeKey = (s.size || '').trim().toUpperCase() || 'NON PRÉCISÉE';
      if (selectedSizeFilter !== 'all' && sizeKey !== selectedSizeFilter) {
        return false;
      }

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
      const reverseName = `${s.lastName || ''} ${s.firstName || ''}`.toLowerCase();
      const cls = (s.classGroup || '').toLowerCase();
      const check = (s.checkNumber || '').toLowerCase();
      return name.includes(q) || reverseName.includes(q) || cls.includes(q) || check.includes(q);
    });
  }, [tshirtStudents, selectedSizeFilter, searchTerm]);

  if (!isOpen) return null;

  // Export CSV de la commande des T-shirts
  const handleExportCsv = () => {
    const headers = ['Nom', 'Prénom', 'Classe', 'Sexe', 'Taille T-shirt', 'Cotisation Réglée', 'Mode Paiement', 'N° Chèque', 'N° Licence'];
    const rows = displayedStudents.map(s => [
      `"${s.lastName || ''}"`,
      `"${s.firstName || ''}"`,
      `"${s.classGroup || ''}"`,
      `"${normalizeGender(s.gender) || ''}"`,
      `"${(s.size || '').trim() || 'Non précisée'}"`,
      `"${s.freeLicense ? 'GRATUIT' : (s.paid || 'NON')}"`,
      `"${s.paymentMethod || ''}"`,
      `"${s.checkNumber || ''}"`,
      `"${s.licenseNumber || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `commande_tshirts_as_${activeYear}_${selectedSizeFilter.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Impression de la liste via iframe invisible (évite window.open bloqué par les iframes / navigateurs)
  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Inventaire des T-shirts AS - ${activeYear}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin-bottom: 4px; font-size: 20px; text-transform: uppercase; }
            .subtitle { color: #64748b; font-size: 13px; margin-bottom: 16px; }
            .summary-table, .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 11px; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; }
            .badge-size { background: #e0e7ff; color: #3730a3; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Association Sportive - Répartition des T-shirts & Maillots</h1>
          <div class="subtitle">Année scolaire : ${activeYear} • Total t-shirts : ${tshirtStudents.length} élèves</div>
          
          <h3>Synthèse par taille</h3>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Taille</th>
                <th style="text-align: center;">Quantité</th>
                <th style="text-align: right;">Pourcentage</th>
              </tr>
            </thead>
            <tbody>
              ${sizeStats.map(s => `
                <tr>
                  <td><strong>${s.size}</strong></td>
                  <td style="text-align: center; font-weight: bold;">${s.count}</td>
                  <td style="text-align: right;">${s.percentage}%</td>
                </tr>
              `).join('')}
              <tr style="background: #f8fafc; font-weight: bold;">
                <td>TOTAL</td>
                <td style="text-align: center;">${tshirtStudents.length}</td>
                <td style="text-align: right;">100%</td>
              </tr>
            </tbody>
          </table>

          <h3>Liste nominative des élèves (${displayedStudents.length})</h3>
          <table class="detail-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Classe</th>
                <th>Taille</th>
                <th>Cotisation</th>
                <th>Émargement / Remis le</th>
              </tr>
            </thead>
            <tbody>
              ${displayedStudents.map((s, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${s.lastName || ''}</strong></td>
                  <td>${s.firstName || ''}</td>
                  <td>${s.classGroup || '-'}</td>
                  <td><span class="badge badge-size">${(s.size || '').trim() || 'Non spécifiée'}</span></td>
                  <td>${s.freeLicense ? 'Gratuit' : (s.paid === 'OUI' ? 'Payé' : 'Impayé')}</td>
                  <td style="width: 140px;"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Shirt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Détail des T-shirts & Maillots AS</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {tshirtStudents.length} demandé{tshirtStudents.length > 1 ? 's' : ''}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Année scolaire {activeYear} • Répartition précise par taille pour commande et distribution
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          
          {/* Synthèse visuelle des tailles */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>📊</span>
                <span>Répartition par taille ({sizeStats.length} taille{sizeStats.length > 1 ? 's' : ''})</span>
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                {yearStudents.length > 0 ? Math.round((tshirtStudents.length / yearStudents.length) * 100) : 0}% des élèves inscrits
              </span>
            </div>

            {sizeStats.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Aucun T-shirt enregistré pour l'année {activeYear}.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {sizeStats.map(stat => {
                  const isSelected = selectedSizeFilter === stat.size;
                  return (
                    <button
                      key={stat.size}
                      type="button"
                      onClick={() => setSelectedSizeFilter(isSelected ? 'all' : stat.size)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm scale-102 ring-2 ring-indigo-200'
                          : 'bg-white hover:bg-indigo-50/60 border-slate-200 text-slate-900 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {stat.size}
                        </span>
                        <span className={`text-[10px] font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {stat.percentage}%
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-xl font-black">{stat.count}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>t-shirt{stat.count > 1 ? 's' : ''}</span>
                      </div>
                      <div className="mt-1.5 w-full bg-slate-100/60 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full ${isSelected ? 'bg-white' : 'bg-indigo-500'}`}
                          style={{ width: `${stat.percentage}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filtres & Recherche de la liste */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500">Filtrer par taille :</span>
              <button
                type="button"
                onClick={() => setSelectedSizeFilter('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  selectedSizeFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Toutes ({tshirtStudents.length})
              </button>
              {sizeStats.map(s => (
                <button
                  key={s.size}
                  type="button"
                  onClick={() => setSelectedSizeFilter(s.size)}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    selectedSizeFilter === s.size
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200/60'
                  }`}
                >
                  {s.size} ({s.count})
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher élève, classe..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tableau des élèves */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 uppercase font-black tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Élève</th>
                    <th className="p-2.5">Classe</th>
                    <th className="p-2.5 text-center">Taille T-shirt</th>
                    <th className="p-2.5">Cotisation</th>
                    <th className="p-2.5">Paiement / Chèque</th>
                    <th className="p-2.5 text-right">Fiche élève</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        Aucun élève trouvé pour les critères sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map(student => {
                      const isFree = !!student.freeLicense;
                      const isPaid = student.paid === 'OUI';
                      const sizeLabel = (student.size || '').trim().toUpperCase() || 'NON PRÉCISÉE';

                      return (
                        <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">
                              {student.lastName} {student.firstName}
                            </div>
                            {student.licenseNumber && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Lic. {student.licenseNumber}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {student.classGroup || '-'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded font-black text-xs ${
                              sizeLabel === 'NON PRÉCISÉE'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                            }`}>
                              👕 {sizeLabel}
                            </span>
                          </td>
                          <td className="p-2.5">
                            {isFree ? (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Gratuit (Prise en charge)
                              </span>
                            ) : isPaid ? (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 w-fit">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Payé ({student.amount || 0} €)</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                Impayé
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600">
                            {student.paymentMethod ? (
                              <div>
                                <span className="font-medium">{student.paymentMethod}</span>
                                {student.checkNumber && (
                                  <div className="font-mono text-[10px] text-slate-500 font-bold">
                                    N° {student.checkNumber}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            {onOpenStudentSheet && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenStudentSheet(student);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition cursor-pointer"
                                title="Ouvrir la fiche élève"
                              >
                                <span>Fiche</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
              title="Télécharger le fichier CSV pour la commande ou la distribution"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Exporter CSV ({displayedStudents.length})</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
              title="Imprimer le listing des tailles avec colonne d'émargement"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Imprimer la liste</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
