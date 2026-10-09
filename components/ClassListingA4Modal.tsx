import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { 
  Download, X, FileSpreadsheet, Check, Sparkles, Loader2, Filter, Layers
} from 'lucide-react';
import { updateStudent, addStudent } from '../lib/db';
import { normalizeGender } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  // Format Portrait A4 (1 page unique par classe)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('portrait');
  // Mode de gestion des lignes vierges pour ajouts manuels
  const [blankRowsMode, setBlankRowsMode] = useState<string>('auto'); // 'auto', '0', '1', '2', '3', '5'
  const [highlightMissing, setHighlightMissing] = useState<boolean>(true);
  const [showBirthDate, setShowBirthDate] = useState<boolean>(true);
  const [showPaymentDetails, setShowPaymentDetails] = useState<boolean>(true);
  const [showEmargement, setShowEmargement] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'incomplete' | 'paid' | 'unpaid'>('all');

  // État de chargement lors de la génération du PDF
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // État pour saisie directe à l'écran avant téléchargement
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
      const isPaid = String(s.paid || '').toUpperCase() === 'OUI' || !!s.freeLicense;
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

  // Calcul du nombre de lignes vierges adaptatif pour garantir 1 seule page
  const getBlankRowsForClass = (studentCount: number) => {
    if (blankRowsMode !== 'auto') {
      return Number(blankRowsMode) || 0;
    }
    // En mode auto pour A4 Portrait :
    if (studentCount <= 14) return 5;
    if (studentCount <= 18) return 4;
    if (studentCount <= 22) return 3;
    if (studentCount <= 25) return 2;
    if (studentCount <= 28) return 1;
    return 0; // Si déjà 29+ élèves, 0 ligne vierge pour ne jamais déborder
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

  const todayFormatted = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  // GÉNÉRATION ET TÉLÉCHARGEMENT DIRECT DU FICHIER PDF (GARANTIE D'UNE PAGE PAR CLASSE)
  const handleDownloadPDF = async () => {
    if (groupedStudents.length === 0) {
      alert("Aucun élève trouvé à exporter pour cette sélection.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfOrientation = orientation === 'portrait' ? 'p' : 'l';
      const doc = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = orientation === 'portrait' ? 210 : 297;
      const pageHeight = orientation === 'portrait' ? 297 : 210;

      // Boucle sur chaque classe : CHAQUE CLASSE APPARAÎT SUR SA PROPRE PAGE A4
      groupedStudents.forEach(([className, classStudents], classIndex) => {
        if (classIndex > 0) {
          doc.addPage('a4', pdfOrientation);
        }

        const totalCount = classStudents.length;
        const freeCount = classStudents.filter(s => !!s.freeLicense).length;
        const paidCount = classStudents.filter(s => String(s.paid || '').toUpperCase() === 'OUI' || !!s.freeLicense).length;
        const licCount = classStudents.filter(s => !!(s.licenseNumber && s.licenseNumber.trim().length > 0)).length;

        const actualBlankRows = getBlankRowsForClass(totalCount);
        const totalRows = totalCount + actualBlankRows;

        // Calibrage fin des dimensions de la table pour tenir rigoureusement sur 1 seule feuille A4
        let fontSize = 7.5;
        let cellPadding = 1.2;
        let headerFontSize = 8;
        if (orientation === 'portrait') {
          if (totalRows <= 16) {
            fontSize = 8.5;
            cellPadding = 1.8;
            headerFontSize = 8.5;
          } else if (totalRows <= 24) {
            fontSize = 7.5;
            cellPadding = 1.2;
            headerFontSize = 8;
          } else {
            fontSize = 6.8;
            cellPadding = 0.8;
            headerFontSize = 7.2;
          }
        } else {
          fontSize = 8;
          cellPadding = 1.5;
          headerFontSize = 8.5;
        }

        // EN-TÊTE GRAPHIQUE OFFICIEL DE LA PAGE
        // Organisation
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(67, 56, 202); // indigo-700
        doc.text('ASSOCIATION SPORTIVE ROSA PARKS  •  UNSS', 6, 7.5);

        // Titre de classe
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(`LISTING PAR CLASSE : ${className}`, 6, 13.5);

        // Sous-titre
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(`Année scolaire : ${activeYear}   |   Effectif inscrit : ${totalCount} élèves`, 6, 18);

        // Badge statistiques à droite
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(pageWidth - 88, 5.5, 82, 8, 1.5, 1.5, 'FD');
        const cotisSummary = freeCount > 0 ? `Cotis: ${paidCount}/${totalCount} (${freeCount} grat.)` : `Cotis: ${paidCount}/${totalCount}`;
        doc.text(`Édité le ${todayFormatted}  •  ${cotisSummary}  •  Lic: ${licCount}/${totalCount}`, pageWidth - 47, 10.5, { align: 'center' });

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Classe ${className}  (Page ${classIndex + 1} / ${groupedStudents.length})`, pageWidth - 6, 18, { align: 'right' });

        // Ligne de séparation sous l'en-tête
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.35);
        doc.line(6, 20.5, pageWidth - 6, 20.5);

        // COLONNES DU TABLEAU
        const headers: string[] = ['N°', 'Nom', 'Prénom', 'Sex'];
        if (showBirthDate) headers.push('Né(e) le');
        headers.push('N° Licence', 'Cotis');
        if (showPaymentDetails) {
          headers.push('Mont.', 'Règlement / N°');
        }
        headers.push('Aut.', 'Nat.', 'Img.', 'T-shirt');
        if (showEmargement) {
          headers.push('Émargement / Remarques');
        }

        // DONNÉES DU TABLEAU
        const tableData: any[][] = [];

        // 1) Élèves inscrits
        classStudents.forEach((st, idx) => {
          const isFree = !!st.freeLicense;
          const isPaid = String(st.paid || '').toUpperCase() === 'OUI' || isFree;
          const isAuth = String(st.parentalAuth || '').toUpperCase() === 'OUI';
          const isSwim = String(st.swimmingCertificate || '').toUpperCase() === 'OUI';
          const isImg = String(st.imageRights || '').toUpperCase() === 'OUI';
          const hasLic = !!(st.licenseNumber && st.licenseNumber.trim().length > 0);

          const row: any[] = [
            String(idx + 1),
            st.lastName?.toUpperCase() || '',
            st.firstName || '',
            normalizeGender(st.gender) || (highlightMissing ? 'F/G' : '')
          ];

          if (showBirthDate) {
            row.push(st.birthDate || (highlightMissing ? '.../.../..' : ''));
          }

          row.push(hasLic ? st.licenseNumber : (highlightMissing ? '...........' : '-'));
          row.push(isFree ? 'GRATUIT' : isPaid ? 'OUI' : (highlightMissing ? 'NON' : 'NON'));

          if (showPaymentDetails) {
            row.push(isFree ? '0 €' : st.amount ? `${st.amount} €` : (highlightMissing ? '... €' : '-'));
            row.push(
              isFree 
                ? 'Licence gratuite'
                : st.paymentMethod 
                  ? `${st.paymentMethod}${st.checkNumber ? ' (' + st.checkNumber + ')' : ''}` 
                  : (highlightMissing ? 'Esp/Chq' : '-')
            );
          }

          row.push(isAuth ? 'OUI' : (highlightMissing ? '[ ] OUI' : 'NON'));
          row.push(isSwim ? 'OUI' : (highlightMissing ? '[ ] OUI' : 'NON'));
          row.push(isImg ? 'OUI' : (highlightMissing ? '[ ] OUI' : 'NON'));
          row.push(
            st.tshirt && String(st.tshirt).toUpperCase() === 'OUI'
              ? `OUI${st.size ? ' (' + st.size + ')' : ''}`
              : (highlightMissing ? 'T:....' : 'NON')
          );

          if (showEmargement) {
            row.push('');
          }

          tableData.push(row);
        });

        // 2) Lignes vierges pour ajouts manuels papier
        for (let b = 0; b < actualBlankRows; b++) {
          const rowNum = String(classStudents.length + b + 1);
          const blankRow: any[] = [
            rowNum,
            'Nom : ...........................',
            'Prénom : ......................',
            'F/G'
          ];
          if (showBirthDate) blankRow.push('.../.../..');
          blankRow.push('..................');
          blankRow.push('[ ] OUI');
          if (showPaymentDetails) {
            blankRow.push('.... €');
            blankRow.push('Esp. / Chq');
          }
          blankRow.push('[ ] OUI');
          blankRow.push('[ ] OUI');
          blankRow.push('[ ] OUI');
          blankRow.push('T:....');
          if (showEmargement) {
            blankRow.push('');
          }
          tableData.push(blankRow);
        }

        // GÉNÉRATION AUTO-TABLE
        autoTable(doc, {
          head: [headers],
          body: tableData,
          startY: 22.5,
          margin: { top: 22.5, right: 6, bottom: 15, left: 6 },
          theme: 'grid',
          tableWidth: 'auto',
          styles: {
            font: 'helvetica',
            fontSize: fontSize,
            cellPadding: cellPadding,
            textColor: [30, 41, 59],
            lineColor: [148, 163, 184],
            lineWidth: 0.15,
            valign: 'middle'
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            halign: 'center',
            lineColor: [71, 85, 105],
            lineWidth: 0.25,
            fontSize: headerFontSize,
            cellPadding: cellPadding + 0.3
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 7 }, // N°
            1: { halign: 'left', fontStyle: 'bold' }, // Nom
            2: { halign: 'left' }, // Prénom
            3: { halign: 'center', cellWidth: 7 }, // Sexe
          },
          didParseCell: (data) => {
            if (data.section === 'body') {
              const raw = String(data.cell.raw || '');
              if (raw === 'OUI') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [5, 150, 105]; // Vert
              } else if (raw === 'NON') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [225, 29, 72]; // Rose
              }
            }
          }
        });

        // PIED DE PAGE EN BAS DE LA FEUILLE A4
        const footerY = pageHeight - 11;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.2);
        doc.line(6, footerY - 2, pageWidth - 6, footerY - 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(
          `Inscrits : ${totalCount}   •   Ajouts papiers : ${actualBlankRows}   •   Capacité page : ${totalCount + actualBlankRows}`,
          6,
          footerY + 3
        );

        // Boîte pour signature enseignant EPS
        const boxWidth = 52;
        const boxHeight = 8;
        const boxX = pageWidth - 6 - boxWidth;
        const boxY = footerY - 0.5;

        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.25);
        doc.rect(boxX, boxY, boxWidth, boxHeight);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(30, 41, 59);
        doc.text('Visa Enseignant EPS :', boxX + 2, boxY + 3.5);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(5.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Signature', boxX + boxWidth - 14, boxY + 6.5);
      });

      // Téléchargement du fichier PDF
      const safeYear = activeYear.replace(/[^a-zA-Z0-9]/g, '_');
      const safeClass = selectedClass === 'ALL' ? 'Toutes_les_classes' : `Classe_${selectedClass}`;
      const filename = `Listings_AS_Rosa_Parks_${safeClass}_${safeYear}.pdf`;

      doc.save(filename);

      setSaveSuccessNotice(`✅ PDF téléchargé avec succès ! (${groupedStudents.length} classe${groupedStudents.length > 1 ? 's' : ''}, 1 page par classe)`);
      setTimeout(() => setSaveSuccessNotice(null), 5000);
    } catch (err: any) {
      console.error("Erreur génération PDF:", err);
      alert("Erreur lors de la création du PDF : " + (err?.message || "Erreur inconnue"));
    } finally {
      setIsGeneratingPdf(false);
    }
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200">
      {/* BARRE D'OUTILS ET DE TÉLÉCHARGEMENT DIRECT (REMPLACE L'IMPRESSION BUGGÉE DU NAVIGATEUR) */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 sm:px-6 shadow-sm shrink-0 z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Téléchargement du Listing par Classe (PDF A4 Portrait)
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                1 page unique par classe
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Génération vectorielle directe : chaque classe apparaît sur sa propre page, sans répétition.
            </p>
          </div>
        </div>

        {/* ACTIONS & BOUTONS DE TÉLÉCHARGEMENT */}
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

          {/* BOUTON PRINCIPAL : TÉLÉCHARGER LE PDF COMPLET AVEC TOUTES LES CLASSES */}
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf || groupedStudents.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title="Télécharger le fichier PDF avec chaque classe sur une page distincte"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Génération du PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  {selectedClass === 'ALL' 
                    ? `Télécharger le PDF (${groupedStudents.length} classe${groupedStudents.length > 1 ? 's' : ''})`
                    : `Télécharger le PDF (Classe ${selectedClass})`
                  }
                </span>
              </>
            )}
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

      {/* PANNEAU DE CONFIGURATION & FILTRES RAPIDES */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-3.5 flex-wrap">
          {/* Sélection de la classe */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              Classe :
            </span>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="ALL">📋 Toutes les classes ({availableClasses.length} pages)</option>
              {availableClasses.map(c => (
                <option key={c} value={c}>Classe {c} (1 page)</option>
              ))}
            </select>
          </div>

          {/* Orientation A4 - Portrait par défaut */}
          <div className="flex items-center gap-1.5 bg-white p-0.5 border border-slate-300 rounded-lg shadow-2xs">
            <button
              onClick={() => setOrientation('portrait')}
              className={`px-2.5 py-1 rounded font-bold text-xs transition cursor-pointer ${
                orientation === 'portrait' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Portrait A4 (1 page / classe)
            </button>
            <button
              onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1 rounded font-bold text-xs transition cursor-pointer ${
                orientation === 'landscape' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Paysage A4
            </button>
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

        {/* Options de colonnes dans le PDF */}
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600 flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={highlightMissing}
              onChange={e => setHighlightMissing(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600"
            />
            <span>Pointillés à compléter</span>
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
        <div className="bg-emerald-500 text-white px-6 py-2 text-xs font-bold flex items-center justify-between animate-in fade-in">
          <span>{saveSuccessNotice}</span>
          <button onClick={() => setSaveSuccessNotice(null)} className="text-white hover:opacity-80">✕</button>
        </div>
      )}

      {/* BANDEAU INDICATEUR MULTI-PAGES */}
      <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-1.5 sm:px-6 flex items-center justify-between text-xs text-indigo-900 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          <span className="font-bold">
            Total à exporter : {groupedStudents.length} page{groupedStudents.length > 1 ? 's' : ''} PDF (1 page distincte par classe)
          </span>
        </div>
        <div className="text-[11px] text-indigo-700">
          Cliquez sur <strong>« Télécharger le PDF »</strong> pour récupérer le document officiel complet.
        </div>
      </div>

      {/* ZONE DE PRÉVISUALISATION DU LISTING */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-800/30 overscroll-contain flex justify-center">
        <div 
          className={`bg-transparent w-full ${orientation === 'portrait' ? 'max-w-[800px]' : 'max-w-[1150px]'} space-y-8 text-slate-900`}
        >
          {groupedStudents.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center text-slate-400 shadow-md">
              <p className="text-base font-bold text-slate-600">Aucun élève trouvé pour cette sélection.</p>
              <p className="text-xs text-slate-400 mt-1">Vérifiez les filtres de classe et d'année scolaire ({activeYear}).</p>
            </div>
          ) : (
            groupedStudents.map(([className, classStudents], groupIdx) => {
              const totalCount = classStudents.length;
              const freeCount = classStudents.filter(s => !!s.freeLicense).length;
              const paidCount = classStudents.filter(s => String(s.paid || '').toUpperCase() === 'OUI' || !!s.freeLicense).length;
              const authCount = classStudents.filter(s => String(s.parentalAuth || '').toUpperCase() === 'OUI').length;
              const licCount = classStudents.filter(s => !!(s.licenseNumber && s.licenseNumber.trim().length > 0)).length;

              // Nombre de lignes vierges adaptatif pour garantir 1 seule page
              const actualBlankRows = getBlankRowsForClass(totalCount);
              const totalRowsOnPage = totalCount + actualBlankRows;
              const density = getDensityConfig(totalRowsOnPage);

              return (
                <div 
                  key={className} 
                  className="bg-white border border-slate-300 shadow-md rounded-sm p-4 sm:p-6 flex flex-col justify-between"
                  style={{ minHeight: orientation === 'portrait' ? '920px' : '650px' }}
                >
                  {/* EN-TÊTE OFFICIEL DE LA CLASSE */}
                  <div>
                    {/* Badge Page N / Total */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        📄 Page {groupIdx + 1} / {groupedStudents.length} dans le PDF
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Classe {className} • Format {orientation === 'portrait' ? 'A4 Portrait' : 'A4 Paysage'}
                      </span>
                    </div>

                    <div className="border-b-2 border-slate-900 pb-2 flex justify-between items-end gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                            Association Sportive Rosa Parks
                          </span>
                          <span className="text-slate-400 text-[10px]">•</span>
                          <span className="text-[10px] font-bold text-slate-600">
                            UNSS
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
                          <span>Cotis. : {paidCount}/{totalCount} {freeCount > 0 ? `(${freeCount} grat.)` : ''}</span>
                          <span>•</span>
                          <span>Licences : {licCount}/{totalCount}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5 italic">
                          1 page par classe • Document officiel EPS / AS
                        </div>
                      </div>
                    </div>

                    {/* TABLEAU DES ÉLÈVES */}
                    <div className="my-2 overflow-hidden">
                      <table className="w-full border-collapse border border-slate-400 table-fixed">
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
                            const isFree = !!st.freeLicense;
                            const isPaid = String(st.paid || '').toUpperCase() === 'OUI' || isFree;
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
                                  {normalizeGender(st.gender) || (
                                    highlightMissing ? (
                                      <span className="block text-[8px] text-slate-400">F/G</span>
                                    ) : ''
                                  )}
                                </td>

                                {/* Né(e) le */}
                                {showBirthDate && (
                                  <td className={`border border-slate-300 ${density.padding} text-center ${density.text} text-slate-700 whitespace-nowrap`}>
                                    {st.birthDate ? (
                                      st.birthDate
                                    ) : highlightMissing ? (
                                      <span className="block text-[8px] text-slate-400">.../.../..</span>
                                    ) : ''}
                                  </td>
                                )}

                                {/* N° Licence */}
                                <td className={`border border-slate-300 ${density.padding} text-center font-mono ${density.text} truncate`}>
                                  {hasLic ? (
                                    <span className="font-bold text-slate-800">{st.licenseNumber}</span>
                                  ) : highlightMissing ? (
                                    <span className="text-slate-400 text-[8px]">.........</span>
                                  ) : (
                                    <span className="text-slate-400 italic">-</span>
                                  )}
                                </td>

                                {/* Cotisation */}
                                <td className={`border border-slate-300 ${density.padding} text-center`}>
                                  {isFree ? (
                                    <span className={`inline-block ${density.badgePadding} rounded font-black ${density.text} bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs`} title="Licence gratuite accordée (Prise en charge AS)">
                                      GRATUIT
                                    </span>
                                  ) : isPaid ? (
                                    <span className={`inline-block ${density.badgePadding} rounded font-black ${density.text} bg-emerald-100 text-emerald-900 border border-emerald-300`}>
                                      OUI
                                    </span>
                                  ) : highlightMissing ? (
                                    <span className={`inline-block ${density.badgePadding} rounded font-bold ${density.text} bg-rose-50 text-rose-700 border border-rose-200`}>
                                      NON
                                    </span>
                                  ) : (
                                    <span className={`font-bold text-rose-700 ${density.text}`}>NON</span>
                                  )}
                                </td>

                                {/* Détail paiement */}
                                {showPaymentDetails && (
                                  <>
                                    <td className={`border border-slate-300 ${density.padding} text-center text-slate-700 font-semibold ${density.text}`}>
                                      {isFree ? (
                                        <span className="text-amber-800 font-bold">0€</span>
                                      ) : st.amount ? (
                                        `${st.amount}€`
                                      ) : highlightMissing ? (
                                        <span className="text-slate-400 text-[8px]">..€</span>
                                      ) : '-'}
                                    </td>
                                    <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-700 truncate`}>
                                      {isFree ? (
                                        <span className="text-amber-800 font-bold bg-amber-50 px-1 py-0.5 rounded border border-amber-200 text-[10px]">
                                          Licence gratuite
                                        </span>
                                      ) : st.paymentMethod ? (
                                        <span>
                                          {st.paymentMethod} {st.checkNumber ? `(${st.checkNumber})` : ''}
                                        </span>
                                      ) : highlightMissing ? (
                                        <span className="text-slate-400 text-[8px]">
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
                                    <span className={`font-bold text-slate-400 ${density.text}`}>[ ] OUI</span>
                                  ) : (
                                    <span className={`font-bold text-slate-400 ${density.text}`}>NON</span>
                                  )}
                                </td>

                                {/* Savoir Nager */}
                                <td className={`border border-slate-300 ${density.padding} text-center`}>
                                  {isSwim ? (
                                    <span className={`font-black text-emerald-800 ${density.text}`}>OUI</span>
                                  ) : highlightMissing ? (
                                    <span className={`font-bold text-slate-400 ${density.text}`}>[ ] OUI</span>
                                  ) : (
                                    <span className={`font-bold text-slate-400 ${density.text}`}>NON</span>
                                  )}
                                </td>

                                {/* Droit Image */}
                                <td className={`border border-slate-300 ${density.padding} text-center`}>
                                  {isImg ? (
                                    <span className={`font-black text-emerald-800 ${density.text}`}>OUI</span>
                                  ) : highlightMissing ? (
                                    <span className={`font-bold text-slate-400 ${density.text}`}>[ ] OUI</span>
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
                                    <span className="text-slate-400 text-[8px]">
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
                                  [ ] OUI
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
                                  [ ] OUI
                                </td>
                                <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                  [ ] OUI
                                </td>
                                <td className={`border border-slate-300 ${density.padding} text-center ${density.subtext} text-slate-400`}>
                                  [ ] OUI
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
                  </div>

                  {/* PIED DE PAGE DE LA CLASSE */}
                  <div className="pt-2 flex justify-between items-center text-[10px] text-slate-600 border-t border-slate-300 shrink-0 mt-auto">
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
