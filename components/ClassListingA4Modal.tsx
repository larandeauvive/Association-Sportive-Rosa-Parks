import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { 
  Printer, X, FileSpreadsheet, Check, Sparkles
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
  // Par défaut en Portrait selon la demande de l'utilisateur
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('portrait');
  // Mode d'ajustement des lignes vierges pour garantir 1 seule page par classe
  const [blankRowsMode, setBlankRowsMode] = useState<string>('auto'); // 'auto', '0', '1', '2', '3', '5'
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

  // Calcul du nombre de lignes vierges adaptatif pour garantir 1 seule page
  const getBlankRowsForClass = (studentCount: number) => {
    if (blankRowsMode !== 'auto') {
      return Number(blankRowsMode) || 0;
    }
    // En mode auto pour A4 Portrait :
    // Une page A4 portrait contient confortablement entre 24 et 28 lignes au total.
    if (studentCount <= 14) return 5;
    if (studentCount <= 18) return 4;
    if (studentCount <= 22) return 3;
    if (studentCount <= 25) return 2;
    if (studentCount <= 28) return 1;
    return 0; // Si déjà 29+ élèves, 0 ligne vierge pour ne jamais déborder sur la page 2
  };

  // Configuration de densité dynamique par classe pour garantir l'ajustement strict sur 1 seule page
  const getDensityConfig = (totalRows: number) => {
    if (orientation === 'landscape') {
      return {
        padding: 'py-1 px-1.5',
        text: 'text-xs',
        subtext: 'text-[11px]',
        headerPadding: 'py-1.5 px-1.5',
        headerText: 'text-[11px]',
        badgePadding: 'px-2 py-0.5 text-[10px]',
        checkboxSize: 'w-3 h-3',
        minHeight: 'min-h-[20px]'
      };
    }

    // Portrait : optimisé pour tenir rigoureusement sur une seule feuille A4
    if (totalRows <= 16) {
      return {
        padding: 'py-1 px-1',
        text: 'text-[10px]',
        subtext: 'text-[9px]',
        headerPadding: 'py-1.5 px-1',
        headerText: 'text-[9.5px]',
        badgePadding: 'px-1.5 py-0.2 text-[9px]',
        checkboxSize: 'w-2.5 h-2.5',
        minHeight: 'min-h-[16px]'
      };
    } else if (totalRows <= 24) {
      return {
        padding: 'py-0.5 px-0.75',
        text: 'text-[9px] leading-tight',
        subtext: 'text-[8px]',
        headerPadding: 'py-1 px-0.75',
        headerText: 'text-[8.5px]',
        badgePadding: 'px-1 py-0.2 text-[8px]',
        checkboxSize: 'w-2 h-2',
        minHeight: 'min-h-[14px]'
      };
    } else {
      // 25+ lignes : ultra-compact pour garantir 1 page A4
      return {
        padding: 'py-[1.5px] px-0.5',
        text: 'text-[8px] leading-none',
        subtext: 'text-[7.5px]',
        headerPadding: 'py-0.5 px-0.5',
        headerText: 'text-[7.5px] leading-tight',
        badgePadding: 'px-1 py-0 text-[7px]',
        checkboxSize: 'w-2 h-2',
        minHeight: 'min-h-[11px]'
      };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200">
      {/* STYLE SPÉCIFIQUE D'IMPRESSION A4 PORTRAIT / 1 PAGE UNIQUE PAR CLASSE */}
      <style>{`
        @media print {
          @page {
            size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
            margin: ${orientation === 'portrait' ? '4mm 4mm 4mm 4mm' : '6mm 6mm'};
          }
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
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
          .class-listing-page {
            box-sizing: border-box !important;
            width: 100% !important;
            height: ${orientation === 'portrait' ? '287mm' : '198mm'} !important;
            max-height: ${orientation === 'portrait' ? '287mm' : '198mm'} !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            padding: 1.5mm 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
          }
          .class-listing-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .table-bordered th, .table-bordered td {
            border: 1px solid #475569 !important;
          }
          .print-write-box {
            border: 1px dashed #64748b !important;
            background-color: #f8fafc !important;
          }
          .print-checkbox-box {
            display: inline-block !important;
            width: 8.5px !important;
            height: 8.5px !important;
            border: 1px solid #334155 !important;
            vertical-align: middle !important;
            margin-right: 2px !important;
          }
        }
      `}</style>

      {/* BARRE D'OUTILS ET DE CONTRÔLE SUPÉRIEURE (ÉCRAN UNIQUEMENT) */}
      <div className="no-print bg-white border-b border-slate-200 px-4 py-2.5 sm:px-6 shadow-sm shrink-0 z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Édition Listing par Classe (A4 Portrait - 1 page / classe)
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                1 page garantie
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Format portrait calibré pour tenir l'intégralité du listing sur une seule page par classe.
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
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-sm cursor-pointer"
            title="Lancer l'impression A4 Portrait (1 page par classe)"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer / PDF (A4 Portrait)</span>
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
      <div className="no-print bg-slate-50 border-b border-slate-200 px-4 py-2 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-3.5 flex-wrap">
          {/* Orientation A4 - Portrait par défaut */}
          <div className="flex items-center gap-1.5 bg-white p-0.5 border border-slate-300 rounded-lg shadow-2xs">
            <button
              onClick={() => setOrientation('portrait')}
              className={`px-2.5 py-1 rounded font-bold text-xs transition cursor-pointer ${
                orientation === 'portrait' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Portrait (1 page / classe)
            </button>
            <button
              onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1 rounded font-bold text-xs transition cursor-pointer ${
                orientation === 'landscape' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Paysage
            </button>
          </div>

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

          {/* Lignes vierges d'ajouts papiers */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700">Lignes vierges :</span>
            <select
              value={blankRowsMode}
              onChange={e => setBlankRowsMode(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="auto">✨ Ajustement auto (1 page garantie)</option>
              <option value="0">0 ligne</option>
              <option value="1">1 ligne</option>
              <option value="2">2 lignes</option>
              <option value="3">3 lignes</option>
              <option value="5">5 lignes</option>
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
              <option value="incomplete">Dossiers incomplets</option>
              <option value="unpaid">Non payés uniquement</option>
              <option value="paid">Cotisations réglées</option>
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
            <span>Pointillés stylo</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showBirthDate}
              onChange={e => setShowBirthDate(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Date naiss.</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showPaymentDetails}
              onChange={e => setShowPaymentDetails(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Paiement / Chq</span>
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
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-800/30 overscroll-contain flex justify-center">
        <div 
          id="print-a4-listing-root" 
          className={`bg-white shadow-2xl rounded-sm w-full ${orientation === 'portrait' ? 'max-w-[794px]' : 'max-w-[1150px]'} p-3 sm:p-6 space-y-6 text-slate-900`}
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

              // Nombre de lignes vierges adaptatif pour garantir 1 seule page
              const actualBlankRows = getBlankRowsForClass(totalCount);
              const totalRowsOnPage = totalCount + actualBlankRows;
              const density = getDensityConfig(totalRowsOnPage);

              return (
                <div 
                  key={className} 
                  className={`class-listing-page ${groupIdx < groupedStudents.length - 1 ? 'page-break' : ''} border border-slate-200 rounded p-3 sm:p-4 mb-6 bg-white shadow-sm flex flex-col justify-between`}
                >
                  {/* EN-TÊTE OFFICIEL DE LA CLASSE (A4) */}
                  <div className="border-b-2 border-slate-900 pb-1.5 flex justify-between items-end gap-2 shrink-0">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                          Association Sportive Rosa Parks
                        </span>
                        <span className="text-slate-400 text-[10px]">•</span>
                        <span className="text-[10px] font-bold text-slate-600">
                          Fédération Nationale UNSS
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                        LISTING PAR CLASSE : <span className="text-indigo-900 underline decoration-indigo-300 underline-offset-2">{className}</span>
                      </h2>
                      <p className="text-[10px] text-slate-600 font-semibold mt-0.5">
                        Année scolaire : <strong className="text-slate-900">{activeYear}</strong> • Effectif inscrit : <strong className="text-slate-900">{totalCount} élèves</strong>
                      </p>
                    </div>

                    <div className="text-right text-[10px] text-slate-600 shrink-0 flex flex-col items-end">
                      <div className="inline-flex items-center gap-1.5 font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 text-[10px]">
                        <span>Édité le {todayFormatted}</span>
                        <span>•</span>
                        <span>Cotis. : {paidCount}/{totalCount}</span>
                        <span>•</span>
                        <span>Licences : {licCount}/{totalCount}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5 italic">
                        Page 1/1 • Document officiel EPS / AS • Compléments manuscrits autorisés
                      </div>
                    </div>
                  </div>

                  {/* TABLEAU DES ÉLÈVES AVEC TOUTES LES INFORMATIONS ET ZONES COMPLÉMENTAIRES */}
                  <div className="my-1.5 flex-1 overflow-hidden">
                    <table className="w-full border-collapse border border-slate-400 table-bordered table-fixed">
                      <thead>
                        <tr className={`bg-slate-100 text-slate-900 font-black border-b-2 border-slate-400 ${density.headerText}`}>
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[24px]`}>N°</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-left w-[17%]`}>Nom</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-left w-[14%]`}>Prénom</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[22px]`} title="Sexe (Fille/Garçon)">Sex.</th>
                          {showBirthDate && (
                            <th className={`border border-slate-400 ${density.headerPadding} text-center w-[64px]`}>Né(e) le</th>
                          )}
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[72px]`}>N° Licence</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[36px]`}>Cotis.</th>
                          {showPaymentDetails && (
                            <>
                              <th className={`border border-slate-400 ${density.headerPadding} text-center w-[38px]`}>Mont.</th>
                              <th className={`border border-slate-400 ${density.headerPadding} text-center w-[76px]`}>Règlement / N°</th>
                            </>
                          )}
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[28px]`} title="Autorisation parentale">Aut.</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[28px]`} title="Attestation Savoir Nager">Nat.</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[28px]`} title="Droit à l'image">Img.</th>
                          <th className={`border border-slate-400 ${density.headerPadding} text-center w-[40px]`}>T-shirt</th>
                          {showEmargement && (
                            <th className={`border border-slate-400 ${density.headerPadding} text-center`}>
                              Émargement / Obs.
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
                              <td className={`border border-slate-300 ${density.padding} text-center font-bold text-slate-500 ${density.text}`}>
                                {idx + 1}
                              </td>

                              {/* Nom */}
                              <td className={`border border-slate-300 ${density.padding} font-bold uppercase text-slate-900 truncate ${density.text}`}>
                                {st.lastName}
                              </td>

                              {/* Prénom */}
                              <td className={`border border-slate-300 ${density.padding} font-semibold text-slate-800 capitalize truncate ${density.text}`}>
                                {st.firstName}
                              </td>

                              {/* Sexe */}
                              <td className={`border border-slate-300 ${density.padding} text-center font-semibold text-slate-600 ${density.text}`}>
                                {st.gender || (
                                  highlightMissing ? (
                                    <span className={`print-write-box block ${density.subtext} text-slate-400 p-0.2`}>F/G</span>
                                  ) : ''
                                )}
                              </td>

                              {/* Né(e) le */}
                              {showBirthDate && (
                                <td className={`border border-slate-300 ${density.padding} text-center ${density.text} text-slate-700 whitespace-nowrap`}>
                                  {st.birthDate ? (
                                    st.birthDate
                                  ) : highlightMissing ? (
                                    <span className={`print-write-box block ${density.subtext} text-slate-400 p-0.2`}>.../.../..</span>
                                  ) : ''}
                                </td>
                              )}

                              {/* N° Licence : si vide, zone manuscrite prête à remplir */}
                              <td className={`border border-slate-300 ${density.padding} text-center font-mono ${density.text} truncate`}>
                                {hasLic ? (
                                  <span className="font-bold text-slate-800">{st.licenseNumber}</span>
                                ) : highlightMissing ? (
                                  <div className={`print-write-box px-0.5 py-0.2 ${density.subtext} text-slate-400 rounded border border-dashed border-slate-400 bg-amber-50/40 text-center`}>
                                    .........
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">-</span>
                                )}
                              </td>

                              {/* Cotisation */}
                              <td className={`border border-slate-300 ${density.padding} text-center`}>
                                {isPaid ? (
                                  <span className={`inline-block ${density.badgePadding} rounded font-black ${density.text} bg-emerald-100 text-emerald-900 border border-emerald-300`}>
                                    OUI
                                  </span>
                                ) : highlightMissing ? (
                                  <div className={`print-write-box px-0.5 py-0.2 ${density.subtext} text-rose-700 rounded border border-dashed border-rose-300 bg-rose-50/40 font-bold text-center`}>
                                    NON
                                  </div>
                                ) : (
                                  <span className={`font-bold text-rose-700 ${density.text}`}>NON</span>
                                )}
                              </td>

                              {/* Détail paiement */}
                              {showPaymentDetails && (
                                <>
                                  <td className={`border border-slate-300 ${density.padding} text-center text-slate-700 font-semibold ${density.text}`}>
                                    {st.amount ? (
                                      `${st.amount}€`
                                    ) : highlightMissing ? (
                                      <span className={`print-write-box block ${density.subtext} text-slate-400 p-0.2`}>..€</span>
                                    ) : '-'}
                                  </td>
                                  <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-700 truncate`}>
                                    {st.paymentMethod ? (
                                      <span>
                                        {st.paymentMethod} {st.checkNumber ? `(${st.checkNumber})` : ''}
                                      </span>
                                    ) : highlightMissing ? (
                                      <span className={`print-write-box block ${density.subtext} text-slate-400 p-0.2`}>
                                        Esp/Chq
                                      </span>
                                    ) : '-'}
                                  </td>
                                </>
                              )}

                              {/* Autorisation parentale */}
                              <td className={`border border-slate-300 ${density.padding} text-center`}>
                                {isAuth ? (
                                  <span className={`font-black text-emerald-800 ${density.text}`}>OUI</span>
                                ) : highlightMissing ? (
                                  <div className={`print-write-box px-0.5 py-0.2 ${density.subtext} text-slate-600 border border-dashed border-slate-400 rounded text-center`}>
                                    <span className="print-checkbox-box"></span> OUI
                                  </div>
                                ) : (
                                  <span className={`font-bold text-slate-400 ${density.text}`}>NON</span>
                                )}
                              </td>

                              {/* Savoir Nager */}
                              <td className={`border border-slate-300 ${density.padding} text-center`}>
                                {isSwim ? (
                                  <span className={`font-black text-emerald-800 ${density.text}`}>OUI</span>
                                ) : highlightMissing ? (
                                  <div className={`print-write-box px-0.5 py-0.2 ${density.subtext} text-slate-600 border border-dashed border-slate-400 rounded text-center`}>
                                    <span className="print-checkbox-box"></span> OUI
                                  </div>
                                ) : (
                                  <span className={`font-bold text-slate-400 ${density.text}`}>NON</span>
                                )}
                              </td>

                              {/* Droit Image */}
                              <td className={`border border-slate-300 ${density.padding} text-center`}>
                                {isImg ? (
                                  <span className={`font-black text-emerald-800 ${density.text}`}>OUI</span>
                                ) : highlightMissing ? (
                                  <div className={`print-write-box px-0.5 py-0.2 ${density.subtext} text-slate-600 border border-dashed border-slate-400 rounded text-center`}>
                                    <span className="print-checkbox-box"></span> OUI
                                  </div>
                                ) : (
                                  <span className={`font-bold text-slate-400 ${density.text}`}>NON</span>
                                )}
                              </td>

                              {/* T-shirt / Taille */}
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.text}`}>
                                {st.tshirt && String(st.tshirt).toUpperCase() === 'OUI' ? (
                                  <span className="font-bold text-slate-800">
                                    OUI {st.size ? `(${st.size})` : ''}
                                  </span>
                                ) : highlightMissing ? (
                                  <span className={`print-write-box block ${density.subtext} text-slate-400 p-0.2`}>
                                    T:..
                                  </span>
                                ) : (
                                  <span className="text-slate-400">NON</span>
                                )}
                              </td>

                              {/* Émargement / Remarques papier */}
                              {showEmargement && (
                                <td className={`border border-slate-300 ${density.padding} text-left text-slate-400 ${density.subtext}`}>
                                  <div className="h-3 flex items-end border-b border-dotted border-slate-400"></div>
                                </td>
                              )}
                            </tr>
                          );
                        })}

                        {/* LIGNES VIERGES POUR AJOUTS PAPIERS PONCTUELS DANS LA CLASSE */}
                        {Array.from({ length: actualBlankRows }).map((_, blankIdx) => {
                          const rowNum = classStudents.length + blankIdx + 1;
                          return (
                            <tr key={`blank-${className}-${blankIdx}`} className="bg-amber-50/20">
                              <td className={`border border-slate-300 ${density.padding} text-center font-bold text-slate-400 ${density.text}`}>
                                {rowNum}
                              </td>
                              <td className={`border border-slate-300 ${density.padding} ${density.text} text-slate-400 italic`}>
                                Nom : ...........................
                              </td>
                              <td className={`border border-slate-300 ${density.padding} ${density.text} text-slate-400 italic`}>
                                Prénom : ......................
                              </td>
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                F/G
                              </td>
                              {showBirthDate && (
                                <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                  .../.../..
                                </td>
                              )}
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                ..................
                              </td>
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              {showPaymentDetails && (
                                <>
                                  <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                    .... €
                                  </td>
                                  <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                    Esp. / Chq
                                  </td>
                                </>
                              )}
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                <span className="print-checkbox-box"></span> OUI
                              </td>
                              <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                T:....
                              </td>
                              {showEmargement && (
                                <td className={`border border-slate-300 ${density.padding}`}>
                                  <div className="h-3 border-b border-dotted border-slate-300"></div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* PIED DE PAGE DE LA CLASSE (A4) */}
                  <div className="pt-1.5 flex justify-between items-center text-[10px] text-slate-600 border-t border-slate-300 shrink-0 mt-auto">
                    <div className="flex items-center gap-2">
                      <span>Inscrits : <strong>{totalCount}</strong></span>
                      <span>•</span>
                      <span>Ajouts papiers : <strong>{actualBlankRows} {actualBlankRows > 1 ? 'lignes' : 'ligne'}</strong></span>
                      <span>•</span>
                      <span>Capacité page : <strong>{totalCount + actualBlankRows}</strong></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="border border-slate-400 px-3 py-1 rounded text-left min-w-[170px] flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-700">Visa Enseignant EPS :</span>
                        <span className="text-[8px] text-slate-400 italic">Signature</span>
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
