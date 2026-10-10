import React, { useState } from 'react';
import { Student } from '../types';
import { SessionManager } from './SessionManager';
import { TeacherRollCall } from './TeacherRollCall';
import { StudentTable } from './StudentTable';
import { 
  LogOut, GraduationCap, CheckCircle2, CalendarDays, 
  Users, Search, Printer, ShieldCheck
} from 'lucide-react';
import { formatDateFr } from '../lib/utils';

interface Props {
  students: Student[];
  activeYear: string;
  onLogout?: () => void;
}

export const TeacherPortal: React.FC<Props> = ({ students, activeYear, onLogout }) => {
  // 3 onglets propres et lisibles : Appel (par défaut), Toutes les séances, Licences
  const [currentTab, setCurrentTab] = useState<'appel' | 'seances' | 'licences'>('appel');

  // Filtres pour l'onglet Licences
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const uniqueClasses = Array.from(new Set(students.map(s => s.classGroup).filter(Boolean))).sort();

  const filteredStudents = students.filter(s => {
    // 1. Recherche texte
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (s.lastName || '').toLowerCase().includes(searchLower) ||
                          (s.firstName || '').toLowerCase().includes(searchLower) ||
                          (s.classGroup || '').toLowerCase().includes(searchLower);
    
    // 2. Filtre classe
    const matchesClass = classFilter ? s.classGroup === classFilter : true;

    // 3. Filtre statut
    let matchesStatus = true;
    const isPaid = String(s.paid).toUpperCase() === 'OUI';
    const isAuth = String(s.parentalAuth).toUpperCase() === 'OUI';
    const hasLicense = !!s.licenseNumber;
    const isComplete = isPaid && isAuth;

    if (statusFilter === 'valid') {
      matchesStatus = isComplete && hasLicense;
    } else if (statusFilter === 'toregister') {
      matchesStatus = isComplete && !hasLicense;
    } else if (statusFilter === 'invalid') {
      matchesStatus = !isComplete;
    } else if (statusFilter === 'licensed_incomplete') {
      matchesStatus = hasLicense && !isComplete;
    }

    return matchesSearch && matchesClass && matchesStatus;
  });

  const handleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handlePrint = () => {
    const dataToProcess = students.filter(s => selectedIds.has(s.id));
    const activeColumns = [
      { key: 'lastName', label: 'Nom' },
      { key: 'firstName', label: 'Prénom' },
      { key: 'birthDate', label: 'Né(e) le' },
      { key: 'classGroup', label: 'Classe' },
      { key: 'licenseNumber', label: 'N° Licence' },
      { key: 'paid', label: 'Payé' },
      { key: 'parentalAuth', label: 'Auto. Parentale' },
      { key: 'imageRights', label: 'Droit Image' },
      { key: 'swimmingCertificate', label: 'Savoir Nager' },
    ];

    const printWindow = window.open('', '', 'height=650,width=850');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>Liste des Licenciés - Espace Enseignant</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #1e293b; }
          h1 { text-align: center; margin: 0 0 4px 0; font-size: 18px; text-transform: uppercase; font-weight: 800; }
          h2 { text-align: center; color: #64748b; font-size: 13px; margin: 0 0 20px 0; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; text-transform: uppercase; font-size: 10px; }
          @media print {
            @page { margin: 1cm; size: A4 portrait; }
            body { padding: 0; }
          }
        </style>
        </head><body>
          <h1>ASSOCIATION SPORTIVE LYCÉE ROSA PARKS • UNSS</h1>
          <h2>Liste des Licenciés — ${activeYear} (Généré le ${new Date().toLocaleDateString('fr-FR')})</h2>
          <table>
            <thead>
              <tr>${activeColumns.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${dataToProcess.map(s => `
                <tr>
                  ${activeColumns.map(c => {
                    if (c.key === 'birthDate') return `<td>${formatDateFr(s[c.key] as string)}</td>`;
                    if (c.key === 'parentalAuth') return `<td style="text-align:center; font-weight:bold; color:${s.parentalAuth === 'OUI' ? '#16a34a' : '#dc2626'}">${s.parentalAuth === 'OUI' ? '✓ Validée' : '✗ Manquante'}</td>`;
                    if (c.key === 'imageRights') return `<td style="text-align:center; font-weight:bold; color:${s.imageRights === 'OUI' ? '#16a34a' : '#d97706'}">${s.imageRights === 'OUI' ? '✓ Validé' : '✗ Refusé'}</td>`;
                    if (c.key === 'swimmingCertificate') return `<td style="text-align:center; font-weight:bold; color:${s.swimmingCertificate === 'OUI' ? '#0284c7' : '#64748b'}">${s.swimmingCertificate === 'OUI' ? '✓ Validé' : '✗ Non validé'}</td>`;
                    if (c.key === 'paid') return `<td style="text-align:center; font-weight:bold; color:${s.paid === 'OUI' ? '#16a34a' : '#dc2626'}">${s.freeLicense ? 'GRATUIT' : (s.paid || '')}</td>`;
                    return `<td>${s[c.key] || ''}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body></html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* En-tête compact & ergonomique optimisé pour smartphone */}
      <header className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-purple-950 text-white px-3.5 py-2.5 sm:px-6 sm:py-3 shadow-md sticky top-0 z-30 border-b border-indigo-800/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
              <GraduationCap className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black tracking-tight truncate leading-tight">
                  Espace Enseignant
                </h1>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-black px-2 py-0.5 rounded-full border border-emerald-400/30 shrink-0">
                  {activeYear}
                </span>
              </div>
              <p className="text-[11px] text-indigo-200/90 font-medium truncate">
                AS Lycée Rosa Parks • UNSS
              </p>
            </div>
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-sm border border-white/15 shrink-0 cursor-pointer"
              title="Quitter l'Espace Enseignant"
            >
              <LogOut className="w-3.5 h-3.5 text-indigo-200" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          )}
        </div>
      </header>

      {/* Corps principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-5 lg:p-6 space-y-4">
        {/* Navigation principale par 3 onglets propres & lisibles sur smartphone */}
        <div className="flex bg-slate-200/80 p-1.5 rounded-2xl border border-slate-300 shadow-2xs gap-1.5 max-w-2xl mx-auto sm:mx-0">
          <button
            onClick={() => setCurrentTab('appel')}
            className={`flex-1 py-2 sm:py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentTab === 'appel'
                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/50'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/50'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">Faire l'appel</span>
          </button>

          <button
            onClick={() => setCurrentTab('seances')}
            className={`flex-1 py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentTab === 'seances'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/50'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span className="truncate">Toutes les séances</span>
          </button>

          <button
            onClick={() => setCurrentTab('licences')}
            className={`flex-1 py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              currentTab === 'licences'
                ? 'bg-indigo-900 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/50'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">Licences</span>
          </button>
        </div>

        {/* 1. ONGLET PROPRE POUR FAIRE L'APPEL AVEC MENU DÉROULANT DES SÉANCES */}
        {currentTab === 'appel' && (
          <TeacherRollCall 
            students={students}
            activeYear={activeYear}
          />
        )}

        {/* 2. ONGLET TOUTES LES SÉANCES AVEC FILTRES CRÉNEAU & INTITULÉ */}
        {currentTab === 'seances' && (
          <SessionManager 
            students={students}
            activeYear={activeYear}
            defaultCategory="all"
            isTeacherView={true}
          />
        )}

        {/* 3. ONGLET LICENCES RÉTABLI AVEC RECHERCHE, FILTRES & IMPRESSION */}
        {currentTab === 'licences' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input 
                    type="text" 
                    placeholder="Rechercher un élève, une classe..." 
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-xs sm:text-sm transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <select 
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-xs sm:text-sm text-slate-700"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">Toutes les classes</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>

                <select 
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-xs sm:text-sm text-slate-700"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Tous les statuts</option>
                  <option value="valid">Licence à jour</option>
                  <option value="licensed_incomplete">⚠️ Licenciés avec dossier incomplet (AP ou Cotisation)</option>
                  <option value="toregister">Dossier complet (à enregistrer)</option>
                  <option value="invalid">Dossier incomplet (non à jour)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-between sm:justify-end shrink-0">
                <div className="text-xs font-bold text-slate-600">
                  {selectedIds.size} sélectionné(s) sur {filteredStudents.length}
                </div>
                <button 
                  disabled={selectedIds.size === 0}
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 bg-indigo-900 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-800 transition shadow-sm font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer</span>
                </button>
              </div>
            </div>
            
            <StudentTable 
              students={filteredStudents}
              columns={[
                { key: 'lastName', label: 'Nom', visible: true },
                { key: 'firstName', label: 'Prénom', visible: true },
                { key: 'birthDate', label: 'Né(e) le', visible: true },
                { key: 'classGroup', label: 'Classe', visible: true },
                { key: 'licenseNumber', label: 'N° Licence', visible: true },
                { key: 'paid', label: 'Payé', visible: true },
                { key: 'parentalAuth', label: 'Auto. Parentale', visible: true },
                { key: 'imageRights', label: 'Droit Image', visible: true },
                { key: 'swimmingCertificate', label: 'Savoir Nager', visible: true },
              ]}
              selectedIds={selectedIds}
              onSelectAll={handleSelectAll}
              onSelectRow={handleSelectRow}
            />
          </div>
        )}
      </main>
    </div>
  );
};
