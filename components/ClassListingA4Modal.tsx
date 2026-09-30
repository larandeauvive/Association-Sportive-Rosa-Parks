import React, { useState, useMemo, useRef } from 'react';
import { Student } from '../types';
import { 
  Printer, X, Filter, FileSpreadsheet, Plus, Check, 
  HelpCircle, Settings2, Download, RefreshCw, Edit3, ChevronDown, CheckCircle2
} from 'lucide-react';
import { updateStudent, addStudent } from '../lib/db';

interface ClassListingA4ModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  activeYear: string;
  onRefreshData?: () => Promise<void> | void;
}

export const ClassListingA4Modal: React.FC<ClassListingA4ModalProps> = ({
  isOpen,
  onClose,
  students,
  activeYear,
  onRefreshData
}) => {
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [blankRowsCount, setBlankRowsCount] = useState<number>(3);
  const [highlightMissing, setHighlightMissing] = useState<boolean>(true);
  const [showBirthDate, setShowBirthDate] = useState<boolean>(true);
  const [showPaymentDetails, setShowPaymentDetails] = useState<boolean>(true);
  const [showEmargement, setShowEmargement] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'incomplete' | 'paid' | 'unpaid'>('all');

  // État pour saisie directe à l'écran avant impression (ajouts ponctuels numériques ou papiers)
  const [editedCells, setEditedCells] = useState<Record<string, Partial<Student>>>({});
  const [customBlankStudents, setCustomBlankStudents] = useState<Record<string, Array<{ id: string; lastName: string; firstName: string; gender: string; birthDate: string; licenseNumber: string; paid: string; amount: string; paymentMethod: string; checkNumber: string; parentalAuth: string; swimmingCertificate: string; imageRights: string; tshirt: string; size: string; notes: string }>>>({});
  const [isSavingChanges, setIsSavingChanges] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Filtrer les élèves de l'année scolaire active
  const yearStudents = useMemo(() => {
    return students.filter(s => (s.schoolYear || '').trim() === activeYear.trim());
  }, [students, activeYear]);

  // Liste ordonnée de toutes les classes existantes
  const availableClasses = useMemo(() => {
    const classSet = new Set<string>();
    yearStudents.forEach(s => {
      const c = (s.classGroup || '').trim();
      if (c) classSet.add(c);
    });
    return Array.from(classSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [yearStudents]);

  // Groupement des élèves par classe avec filtrage
  const groupedStudents = useMemo(() => {
    const map = new Map<string, Student[]>();

    yearStudents.forEach(s => {
      const cls = (s.classGroup || 'Sans classe').trim();
      if (selectedClass !== 'ALL' && cls !== selectedClass) return;

      // Filtre d'état
      const isPaid = String(s.paid || '').toUpperCase() === 'OUI';
      const isAuth = String(s.parentalAuth || '').toUpperCase() === 'OUI';
      const hasLic = !!(s.licenseNumber && s.licenseNumber.trim().length > 0);
      const isComplete = isPaid && isAuth && hasLic;

      if (filterMode === 'incomplete' && isComplete) return;
      if (filterMode === 'paid' && !isPaid) return;
      if (filterMode === 'unpaid' && isPaid) return;

      if (!map.has(cls)) {
        map.set(cls, []);
      }

      // Appliquer d'éventuelles modifications locales en mémoire
      const localOverrides = editedCells[s.id] || {};
      map.get(cls)!.push({ ...s, ...localOverrides });
    });

    // Trier les classes puis les élèves par Nom, Prénom
    const sortedEntries = Array.from(map.entries()).sort(([clsA], [clsB]) => {
      return clsA.localeCompare(clsB, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedEntries.forEach(([_, list]) => {
      list.sort((a, b) => {
        const lastDiff = (a.lastName || '').localeCompare(b.lastName || '', 'fr', { sensitivity: 'base' });
        if (lastDiff !== 0) return lastDiff;
        return (a.firstName || '').localeCompare(b.firstName || '', 'fr', { sensitivity: 'base' });
      });
    });

    return sortedEntries;
  }, [yearStudents, selectedClass, filterMode, editedCells]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCellChange = (studentId: string, field: keyof Student, value: any) => {
    setEditedCells(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [field]: value
      }
    }));
  };

  // Enregistrer les modifications locales dans la base de données
  const handleSaveAllEdits = async () => {
    setIsSavingChanges(true);
    try {
      const updatePromises = Object.entries(editedCells).map(async ([studentId, fields]) => {
        await updateStudent(studentId, fields as Partial<Student>);
      });
      await Promise.all(updatePromises);

      // Enregistrer également les élèves manuellement ajoutés dans les lignes vierges
      const createPromises: Promise<any>[] = [];
      Object.entries(customBlankStudents).forEach(([cls, newRows]) => {
        const rowsArray = (newRows || []) as Array<any>;
        rowsArray.forEach(row => {
          if (row.lastName.trim() || row.firstName.trim()) {
            createPromises.push(
              addStudent({
                lastName: row.lastName.trim().toUpperCase(),
                firstName: row.firstName.trim(),
                classGroup: cls,
                gender: row.gender || 'G',
                schoolYear: activeYear,
                birthDate: row.birthDate || '',
                licenseNumber: row.licenseNumber || '',
                paid: row.paid || 'NON',
                amount: row.amount || '',
                paymentMethod: row.paymentMethod || '',
                checkNumber: row.checkNumber || '',
                parentalAuth: row.parentalAuth || 'NON',
                swimmingCertificate: row.swimmingCertificate || 'NON',
                imageRights: row.imageRights || 'NON',
                tshirt: row.tshirt || 'NON',
                size: row.size || ''
              })
            );
          }
        });
      });
      await Promise.all(createPromises);

      setSaveSuccessNotice("Toutes les modifications et ajouts ont été enregistrés avec succès !");
      setTimeout(() => setSaveSuccessNotice(null), 4000);
      setEditedCells({});
      setCustomBlankStudents({});
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      console.error("Erreur enregistrement listing:", err);
      alert("Erreur lors de l'enregistrement : " + (err?.message || "Erreur inconnue"));
    } finally {
      setIsSavingChanges(false);
    }
  };

  const todayFormatted = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200">
      {/* STYLE SPÉCIFIQUE D'IMPRESSION A4 */}
      <style>{`
        @media print {
          @page {
            size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
            margin: 8mm 6mm;
          }
          body {
            background: white !important;
            color: black !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Masquer tout ce qui est en dehors du conteneur d'impression */
          body * {
            visibility: hidden !important;
          }
          #print-a4-listing-root, #print-a4-listing-root * {
            visibility: visible !important;
          }
          #print-a4-listing-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .table-bordered th, .table-bordered td {
            border: 1px solid #475569 !important;
          }
          .print-write-box {
            border: 1px dashed #64748b !important;
            background-color: #f8fafc !important;
            min-height: 22px !important;
          }
          .print-checkbox-box {
            display: inline-block !important;
            width: 13px !important;
            height: 13px !important;
            border: 1.2px solid #334155 !important;
            vertical-align: middle !important;
            margin-right: 3px !important;
          }
        }
      `}</style>

      {/* BARRE D'OUTILS ET DE CONTRÔLE SUPÉRIEURE (ÉCRAN UNIQUEMENT) */}
      <div className="no-print bg-white border-b border-slate-200 px-4 py-3 sm:px-6 shadow-sm shrink-0 z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Édition du Listing par Classe (Format A4)
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                Année {activeYear}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Prêt à imprimer avec zones pointillées pour compléments et ajouts papiers ponctuels.
            </p>
          </div>
        </div>

        {/* ACTIONS & BOUTONS */}
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(editedCells).length > 0 && (
            <button
              onClick={handleSaveAllEdits}
              disabled={isSavingChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Enregistrer les modifications saisies à l'écran dans la base"
            >
              <Check className="w-4 h-4" />
              <span>{isSavingChanges ? "Enregistrement..." : `Enregistrer (${Object.keys(editedCells).length} modif.)`}</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer / Exporter PDF (A4)</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PANNEAU DE CONFIGURATION & FILTRES RAPIDES (ÉCRAN UNIQUEMENT) */}
      <div className="no-print bg-slate-50 border-b border-slate-200 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Sélection de la classe */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700">Classe :</span>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="ALL">📋 Toutes les classes ({availableClasses.length})</option>
              {availableClasses.map(c => (
                <option key={c} value={c}>Classe {c}</option>
              ))}
            </select>
          </div>

          {/* Orientation A4 */}
          <div className="flex items-center gap-1.5 bg-white p-0.5 border border-slate-300 rounded-lg shadow-2xs">
            <button
              onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1 rounded font-bold transition ${
                orientation === 'landscape' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Paysage (Recommandé)
            </button>
            <button
              onClick={() => setOrientation('portrait')}
              className={`px-2.5 py-1 rounded font-bold transition ${
                orientation === 'portrait' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Portrait
            </button>
          </div>

          {/* Nombre de lignes vierges d'ajouts papiers */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700">Lignes vierges par classe :</span>
            <select
              value={blankRowsCount}
              onChange={e => setBlankRowsCount(Number(e.target.value))}
              className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="0">0 ligne</option>
              <option value="2">2 lignes</option>
              <option value="3">3 lignes (idéal A4)</option>
              <option value="5">5 lignes</option>
              <option value="8">8 lignes</option>
              <option value="10">10 lignes</option>
            </select>
          </div>

          {/* Filtre d'état */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700">Afficher :</span>
            <select
              value={filterMode}
              onChange={e => setFilterMode(e.target.value as any)}
              className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="all">Tous les élèves</option>
              <option value="incomplete">Dossiers incomplets uniquement</option>
              <option value="unpaid">Non payés uniquement</option>
              <option value="paid">Cotisations réglées uniquement</option>
            </select>
          </div>
        </div>

        {/* Options de colonnes */}
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={highlightMissing}
              onChange={e => setHighlightMissing(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Cadres pointillés stylo</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showBirthDate}
              onChange={e => setShowBirthDate(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Date naissance</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showPaymentDetails}
              onChange={e => setShowPaymentDetails(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Détail paiement</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showEmargement}
              onChange={e => setShowEmargement(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Émargement</span>
          </label>
        </div>
      </div>

      {saveSuccessNotice && (
        <div className="no-print bg-emerald-500 text-white px-6 py-2 text-xs font-bold flex items-center justify-between animate-in fade-in">
          <span>{saveSuccessNotice}</span>
          <button onClick={() => setSaveSuccessNotice(null)} className="text-white hover:opacity-80">✕</button>
        </div>
      )}

      {/* ZONE DE PRÉVISUALISATION DU LISTING A4 */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-800/20 overscroll-contain flex justify-center">
        <div 
          id="print-a4-listing-root" 
          className="bg-white shadow-2xl rounded-sm w-full max-w-[1150px] p-4 sm:p-8 space-y-12 text-slate-900"
        >
          {groupedStudents.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-base font-bold text-slate-600">Aucun élève trouvé pour cette sélection.</p>
              <p className="text-xs text-slate-400 mt-1">Vérifiez les filtres de classe et d'année scolaire ({activeYear}).</p>
            </div>
          ) : (
            groupedStudents.map(([className, classStudents], groupIdx) => {
              const totalCount = classStudents.length;
              const paidCount = classStudents.filter(s => String(s.paid || '').toUpperCase() === 'OUI').length;
              const authCount = classStudents.filter(s => String(s.parentalAuth || '').toUpperCase() === 'OUI').length;
              const licCount = classStudents.filter(s => !!(s.licenseNumber && s.licenseNumber.trim().length > 0)).length;

              return (
                <div 
                  key={className} 
                  className={`class-listing-page ${groupIdx < groupedStudents.length - 1 ? 'page-break' : ''} space-y-4`}
                >
                  {/* EN-TÊTE OFFICIEL DE LA CLASSE (A4) */}
                  <div className="border-b-2 border-slate-900 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black uppercase tracking-widest text-indigo-700">
                          Association Sportive Rosa Parks
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-[11px] font-bold text-slate-600">
                          Fédération Nationale UNSS
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                        LISTING PAR CLASSE : <span className="text-indigo-900 underline decoration-indigo-300 underline-offset-4">{className}</span>
                      </h2>
                      <p className="text-xs text-slate-600 font-semibold mt-1">
                        Année scolaire : <strong className="text-slate-900">{activeYear}</strong> • Effectif inscrit : <strong className="text-slate-900">{totalCount} élèves</strong>
                      </p>
                    </div>

                    <div className="text-right text-xs text-slate-600 flex flex-col items-start sm:items-end">
                      <div className="flex items-center gap-2 font-bold text-slate-800 text-[11px] bg-slate-100 px-2.5 py-1 rounded border border-slate-300">
                        <span>Édité le {todayFormatted}</span>
                        <span>•</span>
                        <span>Cotisations : {paidCount}/{totalCount}</span>
                        <span>•</span>
                        <span>Licences : {licCount}/{totalCount}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 italic">
                        Document officiel EPS / AS — Compléments manuscrits autorisés
                      </div>
                    </div>
                  </div>

                  {/* TABLEAU DES ÉLÈVES AVEC TOUTES LES INFORMATIONS ET ZONES COMPLÉMENTAIRES */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-400 text-xs table-bordered">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border-b-2 border-slate-400 text-[11px]">
                          <th className="border border-slate-400 p-1.5 text-center w-8">N°</th>
                          <th className="border border-slate-400 p-1.5 text-left min-w-[120px]">Nom</th>
                          <th className="border border-slate-400 p-1.5 text-left min-w-[100px]">Prénom</th>
                          <th className="border border-slate-400 p-1.5 text-center w-8">Sex.</th>
                          {showBirthDate && (
                            <th className="border border-slate-400 p-1.5 text-center min-w-[80px]">Né(e) le</th>
                          )}
                          <th className="border border-slate-400 p-1.5 text-center min-w-[100px]">N° Licence</th>
                          <th className="border border-slate-400 p-1.5 text-center min-w-[70px]">Cotis. €</th>
                          {showPaymentDetails && (
                            <>
                              <th className="border border-slate-400 p-1.5 text-center min-w-[60px]">Montant</th>
                              <th className="border border-slate-400 p-1.5 text-center min-w-[110px]">Règlement / N° Chq</th>
                            </>
                          )}
                          <th className="border border-slate-400 p-1.5 text-center w-14" title="Autorisation parentale">Aut. Par.</th>
                          <th className="border border-slate-400 p-1.5 text-center w-14" title="Attestation Savoir Nager">Natation</th>
                          <th className="border border-slate-400 p-1.5 text-center w-14" title="Droit à l'image">Dr. Image</th>
                          <th className="border border-slate-400 p-1.5 text-center min-w-[70px]">T-shirt</th>
                          {showEmargement && (
                            <th className="border border-slate-400 p-1.5 text-center min-w-[120px]">
                              Émargement / Remarques
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {classStudents.map((st, idx) => {
                          const isPaid = String(st.paid || '').toUpperCase() === 'OUI';
                          const isAuth = String(st.parentalAuth || '').toUpperCase() === 'OUI';
                          const isSwim = String(st.swimmingCertificate || '').toUpperCase() === 'OUI';
                          const isImg = String(st.imageRights || '').toUpperCase() === 'OUI';
                          const hasLic = !!(st.licenseNumber && st.licenseNumber.trim().length > 0);

                          return (
                            <tr key={st.id} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                              {/* Index */}
                              <td className="border border-slate-300 p-1.5 text-center font-bold text-slate-500">
                                {idx + 1}
                              </td>

                              {/* Nom */}
                              <td className="border border-slate-300 p-1.5 font-bold uppercase text-slate-900">
                                {st.lastName}
                              </td>

                              {/* Prénom */}
                              <td className="border border-slate-300 p-1.5 font-semibold text-slate-800 capitalize">
                                {st.firstName}
                              </td>

                              {/* Sexe */}
                              <td className="border border-slate-300 p-1.5 text-center font-semibold text-slate-600">
                                {st.gender || (
                                  highlightMissing ? (
                                    <span className="print-write-box block text-[9px] text-slate-400 p-0.5">F/G</span>
                                  ) : ''
                                )}
                              </td>

                              {/* Né(e) le */}
                              {showBirthDate && (
                                <td className="border border-slate-300 p-1.5 text-center text-[11px] text-slate-700">
                                  {st.birthDate ? (
                                    st.birthDate
                                  ) : highlightMissing ? (
                                    <span className="print-write-box block text-[9px] text-slate-400 p-0.5">.../.../....</span>
                                  ) : ''}
                                </td>
                              )}

                              {/* N° Licence : si vide, zone manuscrite prête à remplir */}
                              <td className="border border-slate-300 p-1.5 text-center font-mono text-[11px]">
                                {hasLic ? (
                                  <span className="font-bold text-slate-800">{st.licenseNumber}</span>
                                ) : highlightMissing ? (
                                  <div className="print-write-box p-1 text-[9px] text-slate-400 rounded border border-dashed border-slate-400 bg-amber-50/40">
                                    <span className="font-sans font-semibold">À saisir :</span> ............
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">Non renseigné</span>
                                )}
                              </td>

                              {/* Cotisation */}
                              <td className="border border-slate-300 p-1.5 text-center">
                                {isPaid ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-300">
                                    OUI
                                  </span>
                                ) : highlightMissing ? (
                                  <div className="print-write-box p-1 text-[9px] text-rose-700 rounded border border-dashed border-rose-300 bg-rose-50/40 font-bold">
                                    NON (À régler)
                                  </div>
                                ) : (
                                  <span className="font-bold text-rose-700 text-[10px]">NON</span>
                                )}
                              </td>

                              {/* Détail paiement */}
                              {showPaymentDetails && (
                                <>
                                  <td className="border border-slate-300 p-1.5 text-center text-slate-700 font-semibold">
                                    {st.amount ? (
                                      `${st.amount} €`
                                    ) : highlightMissing ? (
                                      <span className="print-write-box block text-[9px] text-slate-400 p-0.5">... €</span>
                                    ) : '-'}
                                  </td>
                                  <td className="border border-slate-300 p-1.5 text-center text-[10px] text-slate-700">
                                    {st.paymentMethod ? (
                                      <span>
                                        {st.paymentMethod} {st.checkNumber ? `(Chq: ${st.checkNumber})` : ''}
                                      </span>
                                    ) : highlightMissing ? (
                                      <span className="print-write-box block text-[9px] text-slate-400 p-0.5">
                                        Esp. / Chq n° ......
                                      </span>
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* Autorisation parentale */}
                              <td className="border border-slate-300 p-1.5 text-center">
                                {isAuth ? (
                                  <span className="font-black text-emerald-800 text-[11px]">OUI</span>
                                ) : highlightMissing ? (
                                  <div className="print-write-box p-0.5 text-[9px] text-slate-600 border border-dashed border-slate-400 rounded">
                                    <span className="print-checkbox-box"></span> OUI
                                  </div>
                                ) : (
                                  <span className="font-bold text-slate-400 text-[11px]">NON</span>
                                )}
                              </td>

                              {/* Savoir Nager */}
                              <td className="border border-slate-300 p-1.5 text-center">
                                {isSwim ? (
                                  <span className="font-black text-emerald-800 text-[11px]">OUI</span>
                                ) : highlightMissing ? (
                                  <div className="print-write-box p-0.5 text-[9px] text-slate-600 border border-dashed border-slate-400 rounded">
                                    <span className="print-checkbox-box"></span> OUI
                                  </div>
                                ) : (
                                  <span className="font-bold text-slate-400 text-[11px]">NON</span>
                                )}
                              </td>

                              {/* Droit Image */}
                              <td className="border border-slate-300 p-1.5 text-center">
                                {isImg ? (
                                  <span className="font-black text-emerald-800 text-[11px]">OUI</span>
                                ) : highlightMissing ? (
                                  <div className="print-write-box p-0.5 text-[9px] text-slate-600 border border-dashed border-slate-400 rounded">
                                    <span className="print-checkbox-box"></span> OUI
                                  </div>
                                ) : (
                                  <span className="font-bold text-slate-400 text-[11px]">NON</span>
                                )}
                              </td>

                              {/* T-shirt / Taille */}
                              <td className="border border-slate-300 p-1.5 text-center text-[10px]">
                                {st.tshirt && String(st.tshirt).toUpperCase() === 'OUI' ? (
                                  <span className="font-bold text-slate-800">
                                    OUI {st.size ? `(${st.size})` : ''}
                                  </span>
                                ) : highlightMissing ? (
                                  <span className="print-write-box block text-[9px] text-slate-400 p-0.5">
                                    Taille: ....
                                  </span>
                                ) : (
                                  <span className="text-slate-400">NON</span>
                                )}
                              </td>

                              {/* Émargement / Remarques papier */}
                              {showEmargement && (
                                <td className="border border-slate-300 p-1.5 text-left text-slate-400 text-[10px]">
                                  <div className="h-6 flex items-end border-b border-dotted border-slate-400"></div>
                                </td>
                              )}
                            </tr>
                          );
                        })}

                        {/* LIGNES VIERGES POUR AJOUTS PAPIERS PONCTUELS DANS LA CLASSE */}
                        {Array.from({ length: blankRowsCount }).map((_, blankIdx) => {
                          const rowNum = classStudents.length + blankIdx + 1;
                          return (
                            <tr key={`blank-${className}-${blankIdx}`} className="bg-amber-50/20">
                              <td className="border border-slate-300 p-2 text-center font-bold text-slate-400 text-[10px]">
                                {rowNum}
                              </td>
                              <td className="border border-slate-300 p-2">
                                <div className="text-[10px] text-slate-400 italic">
                                  Nom : ...................................
                                </div>
                              </td>
                              <td className="border border-slate-300 p-2">
                                <div className="text-[10px] text-slate-400 italic">
                                  Prénom : ..............................
                                </div>
                              </td>
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                F / G
                              </td>
                              {showBirthDate && (
                                <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                  .../.../....
                                </td>
                              )}
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                .....................
                              </td>
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                <span className="print-checkbox-box"></span> OUI <span className="print-checkbox-box ml-1"></span> NON
                              </td>
                              {showPaymentDetails && (
                                <>
                                  <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                    ...... €
                                  </td>
                                  <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                    Esp. / Chq n° ......
                                  </td>
                                </>
                              )}
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              <td className="border border-slate-300 p-2 text-center text-[9px] text-slate-400">
                                Taille : ....
                              </td>
                              {showEmargement && (
                                <td className="border border-slate-300 p-2">
                                  <div className="h-4 border-b border-dotted border-slate-300"></div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* PIED DE PAGE DE LA CLASSE (A4) */}
                  <div className="pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-slate-600 gap-2 border-t border-slate-300">
                    <div className="flex items-center gap-3">
                      <span>Total élèves inscrits : <strong>{totalCount}</strong></span>
                      <span>•</span>
                      <span>Ajouts papiers prévus : <strong>{blankRowsCount} lignes</strong></span>
                      <span>•</span>
                      <span>Capacité totale page : <strong>{totalCount + blankRowsCount}</strong></span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="border border-slate-400 px-4 py-1.5 rounded text-left min-w-[200px]">
                        <span className="text-[10px] font-bold text-slate-700 block">Visa Enseignant EPS :</span>
                        <div className="h-6"></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
