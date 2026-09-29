import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, X, Check, FileSpreadsheet, Loader2, Play, Users, 
  ArrowRight, AlertTriangle, Download, Copy, Printer, CheckCircle2, 
  Search, Filter, FileText, AlertCircle 
} from 'lucide-react';
import { Student } from '../types';
import { formatDateFr, normalizeGender } from '../lib/utils';
import { batchUpsertStudentsApi, deleteMultipleStudents, updateStudent } from '../lib/db';

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  activeYear: string;
  onSuccess: () => void;
  students: Student[];
}

function levenshtein(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}

function normalizeStr(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ isOpen, onClose, activeYear, onSuccess, students }) => {
  const [mode, setMode] = useState<'pronote' | 'unss'>('pronote');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [importRecords, setImportRecords] = useState<{ student: Partial<Student> & Omit<Student, 'id'>, isDuplicate: boolean, selected: boolean }[]>([]);
  const [previewUpdateData, setPreviewUpdateData] = useState<{ id: string, licenseNumber: string, originalStudent: Student }[]>([]);
  const [conflictsData, setConflictsData] = useState<{ id: string, licenseNumber: string, originalStudent: Student, unssBirthDate: string, selected: boolean }[]>([]);
  const [unmatchedUnss, setUnmatchedUnss] = useState<{ unssLastName: string, unssFirstName: string, unssBirthDate: string, licenseNumber: string, selectedStudentId: string | null }[]>([]);
  const [alreadyLicensedIncomplete, setAlreadyLicensedIncomplete] = useState<Student[]>([]);
  const [missingStudents, setMissingStudents] = useState<{ student: Student, selected: boolean }[]>([]);
  const [targetClass, setTargetClass] = useState('');
  
  // UNSS specific UI states
  const [unssSubTab, setUnssSubTab] = useState<'matched' | 'incomplete' | 'conflicts' | 'unmatched'>('matched');
  const [incompleteSearch, setIncompleteSearch] = useState('');
  const [incompleteReasonFilter, setIncompleteReasonFilter] = useState<'all' | 'auth_only' | 'paid_only' | 'both'>('all');
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [postSyncRecap, setPostSyncRecap] = useState<{ totalUpdated: number; incompleteList: any[] } | null>(null);

  if (!isOpen) return null;

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        setFileHeaders(headers);
        setParsedData(data);
        
        // Auto-detect columns
        const newMapping: Record<string, string> = {};
        const lowerHeaders = headers.map(h => h.toLowerCase());
        
        const findHeader = (keywords: string[]) => {
            const index = lowerHeaders.findIndex(h => keywords.some(k => h.includes(k)));
            return index >= 0 ? headers[index] : '';
        };

        if (mode === 'pronote') {
            newMapping.lastName = findHeader(['nom']);
            newMapping.firstName = findHeader(['prénom', 'prenom']);
            newMapping.classGroup = findHeader(['classe', 'rattachement']);
            newMapping.birthDate = findHeader(['né(e)', 'naissance', 'date']);
            newMapping.gender = findHeader(['sexe', 'genre']);
            newMapping.paid = findHeader(['payé', 'paiement', 'regle', 'cotisation']);
            newMapping.amount = findHeader(['montant', 'prix']);
            newMapping.paymentMethod = findHeader(['mode', 'espece', 'cheque', 'moyen']);
            newMapping.checkNumber = findHeader(['numéro de chèque', 'n° de chèque', 'num cheque']);
            newMapping.parentalAuth = findHeader(['autorisation', 'parentale']);
            newMapping.imageRights = findHeader(['image', 'droit']);
            newMapping.swimmingCertificate = findHeader(['nager', 'savoir nager', 'natation']);
            newMapping.tshirt = findHeader(['t-shirt', 'tshirt', 'maillot']);
            newMapping.size = findHeader(['taille']);
        } else {
            newMapping.lastName = findHeader(['nom']);
            newMapping.firstName = findHeader(['prénom', 'prenom']);
            newMapping.birthDate = findHeader(['né(e)', 'naissance', 'date']);
            newMapping.licenseNumber = findHeader(['licence', 'numéro']);
        }
        setColumnMapping(newMapping);
        setStep(2);
      } else {
        alert("Le fichier est vide.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const processMapping = () => {
    if (mode === 'pronote') {
        processPronote();
    } else {
        processUnss();
    }
  };

  const processPronote = () => {
    setIsProcessing(true);
    const { lastName, firstName, classGroup, birthDate, gender, paid, amount, paymentMethod, checkNumber, parentalAuth, imageRights, swimmingCertificate, tshirt, size } = columnMapping;

    if (!lastName || !firstName) {
        alert("Veuillez mapper au moins le Nom et le Prénom.");
        setIsProcessing(false);
        return;
    }

    const parsedStudents = parsedData.map(row => {
      let lName = (row[lastName] || '').trim().toUpperCase();
      let fName = (row[firstName] || '').trim();

      // Fallback if they are in the same column (e.g. Nom Prénom)
      if (lastName === firstName && lName) {
          const parts = lName.split(/\s+/);
          const lParts = [];
          const fParts = [];
          for (const part of parts) {
            if (part === part.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(part)) {
                lParts.push(part);
            } else {
                fParts.push(part);
            }
          }
          if (lParts.length === 0) {
              lParts.push(parts[0] || '');
              fParts.push(...parts.slice(1));
          }
          lName = lParts.join(' ').toUpperCase();
          fName = fParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }

      const extractedClass = classGroup ? (row[classGroup] || '').toUpperCase() : '';
      const existingStudent = students.find(s => 
        s.schoolYear === activeYear && 
        normalizeStr(s.lastName) === normalizeStr(lName) && 
        normalizeStr(s.firstName) === normalizeStr(fName)
      );

      return {
        student: {
          ...(existingStudent ? { id: existingStudent.id } : {}),
          lastName: lName,
          firstName: fName,
          birthDate: birthDate ? (row[birthDate] || '') : (existingStudent?.birthDate || ''),
          classGroup: targetClass || extractedClass || (existingStudent?.classGroup || ''),
          schoolYear: activeYear,
          licenseNumber: existingStudent?.licenseNumber || '',
          paid: paid ? (row[paid] || 'NON') : (existingStudent?.paid || 'NON'),
          amount: amount ? (row[amount] || '') : (existingStudent?.amount || ''),
          paymentMethod: paymentMethod ? (row[paymentMethod] || '') : (existingStudent?.paymentMethod || ''),
          checkNumber: checkNumber ? (row[checkNumber] || '') : (existingStudent?.checkNumber || ''),
          parentalAuth: parentalAuth ? (row[parentalAuth] || '') : (existingStudent?.parentalAuth || ''),
          imageRights: imageRights ? (row[imageRights] || '') : (existingStudent?.imageRights || ''),
          tshirt: tshirt ? (row[tshirt] || '') : (existingStudent?.tshirt || ''),
          size: size ? (row[size] || '') : (existingStudent?.size || ''),
          gender: gender ? (normalizeGender(row[gender]) || existingStudent?.gender || '') : (existingStudent?.gender || ''),
          swimmingCertificate: swimmingCertificate ? (row[swimmingCertificate] || 'NON') : (existingStudent?.swimmingCertificate || 'NON')
        },
        isDuplicate: !!existingStudent,
        selected: !existingStudent
      };
    }).filter(s => s.student.lastName);

    // Identify missing students (in DB for this year, but not in imported list)
    const importedNames = new Set(parsedStudents.map(s => `${normalizeStr(s.student.lastName)}_${normalizeStr(s.student.firstName)}`));
    const missing = students
      .filter(s => s.schoolYear === activeYear && !importedNames.has(`${normalizeStr(s.lastName)}_${normalizeStr(s.firstName)}`))
      .map(s => ({ student: s, selected: true }));

    setMissingStudents(missing);
    setImportRecords(parsedStudents);
    setStep(3);
    setIsProcessing(false);
  };

  const processUnss = () => {
    setIsProcessing(true);
    const { lastName, firstName, birthDate, licenseNumber } = columnMapping;

    if (!lastName || !firstName || !birthDate || !licenseNumber) {
        alert("Veuillez mapper tous les champs requis.");
        setIsProcessing(false);
        return;
    }

    const updates: { id: string, licenseNumber: string, originalStudent: Student }[] = [];
    const newConflicts: { id: string, licenseNumber: string, originalStudent: Student, unssBirthDate: string, selected: boolean }[] = [];
    const newUnmatched: { unssLastName: string, unssFirstName: string, unssBirthDate: string, licenseNumber: string, selectedStudentId: string | null }[] = [];
    const alreadyLicensedIncomp: Student[] = [];

    parsedData.forEach(row => {
      const license = (row[licenseNumber] || '').trim();
      const origLastName = (row[lastName] || '').trim();
      const origFirstName = (row[firstName] || '').trim();
      const dob = (row[birthDate] || '').trim();

      if (!license || !dob || !origLastName || !origFirstName) return;

      // Check if student in DB for activeYear already has this license assigned
      const existingWithThisLicense = students.find(s => s.schoolYear === activeYear && s.licenseNumber === license);
      if (existingWithThisLicense) {
        const isPaid = String(existingWithThisLicense.paid || '').toUpperCase().trim() === 'OUI';
        const isAuth = String(existingWithThisLicense.parentalAuth || '').toUpperCase().trim() === 'OUI';
        if (!isPaid || !isAuth) {
          if (!alreadyLicensedIncomp.some(s => s.id === existingWithThisLicense.id)) {
            alreadyLicensedIncomp.push(existingWithThisLicense);
          }
        }
        return;
      }

      // Skip this row if the license number is already assigned to any student in the database
      const licenseAlreadyExists = students.some(s => s.licenseNumber === license);
      if (licenseAlreadyExists) return;

      const normLast = normalizeStr(origLastName);
      const normFirst = normalizeStr(origFirstName);
      const formattedDob = formatDateFr(dob);

      const yearStudents = students.filter(s => s.schoolYear === activeYear && !s.licenseNumber);
      
      const exactNameMatch = yearStudents.find(s => 
        normalizeStr(s.lastName) === normLast && 
        normalizeStr(s.firstName) === normFirst
      );

      if (exactNameMatch) {
         if (formatDateFr(exactNameMatch.birthDate) === formattedDob) {
           updates.push({
             id: exactNameMatch.id,
             licenseNumber: license,
             originalStudent: exactNameMatch
           });
         } else {
           newConflicts.push({
             id: exactNameMatch.id,
             licenseNumber: license,
             originalStudent: exactNameMatch,
             unssBirthDate: dob,
             selected: false
           });
         }
         return; 
      }

      const dobMatches = yearStudents.filter(s => formatDateFr(s.birthDate) === formattedDob);
      if (dobMatches.length > 0) {
        let bestMatch = null;
        let bestScore = Infinity;
        
        for (const student of dobMatches) {
          const sFirstName = normalizeStr(student.firstName);
          const sLastName = normalizeStr(student.lastName);
          const scoreFirst = levenshtein(sFirstName, normFirst);
          const scoreLast = levenshtein(sLastName, normLast);
          const totalScore = scoreFirst + scoreLast;
          
          if (totalScore < bestScore) {
            bestScore = totalScore;
            bestMatch = student;
          }
        }

        if (bestMatch && bestScore <= 4 && !bestMatch.licenseNumber) {
           updates.push({
             id: bestMatch.id,
             licenseNumber: license,
             originalStudent: bestMatch
           });
           return;
        }
      }

      newUnmatched.push({
        unssLastName: origLastName,
        unssFirstName: origFirstName,
        unssBirthDate: dob,
        licenseNumber: license,
        selectedStudentId: null
      });
    });

    setPreviewUpdateData(updates);
    setConflictsData(newConflicts);
    setUnmatchedUnss(newUnmatched);
    setAlreadyLicensedIncomplete(alreadyLicensedIncomp);
    setUnssSubTab('matched');
    setStep(3);
    setIsProcessing(false);
  };

  const getIncompleteLicensedStudents = () => {
    const list: {
      id: string;
      lastName: string;
      firstName: string;
      classGroup: string;
      birthDate?: string;
      licenseNumber: string;
      paid: string;
      parentalAuth: string;
      missingAuth: boolean;
      missingPaid: boolean;
      reason: 'both' | 'auth_only' | 'paid_only';
      label: string;
      source: 'matched' | 'conflict' | 'manual' | 'already_in_db';
      sourceLabel: string;
    }[] = [];

    const seenIds = new Set<string>();

    const checkAndAdd = (student: Student, licenseNum: string, source: 'matched' | 'conflict' | 'manual' | 'already_in_db', sourceLabel: string) => {
      if (!student || !student.id || seenIds.has(student.id)) return;
      const isPaid = String(student.paid || '').toUpperCase().trim() === 'OUI';
      const isAuth = String(student.parentalAuth || '').toUpperCase().trim() === 'OUI';
      const missingAuth = !isAuth;
      const missingPaid = !isPaid;

      if (missingAuth || missingPaid) {
        seenIds.add(student.id);
        let reason: 'both' | 'auth_only' | 'paid_only' = 'both';
        let label = 'AP et Cotisation non validées';
        if (missingAuth && !missingPaid) {
          reason = 'auth_only';
          label = 'Autorisation parentale manquante';
        } else if (!missingAuth && missingPaid) {
          reason = 'paid_only';
          label = 'Cotisation / Paiement non validé';
        }

        list.push({
          id: student.id,
          lastName: student.lastName || '',
          firstName: student.firstName || '',
          classGroup: student.classGroup || '',
          birthDate: student.birthDate,
          licenseNumber: licenseNum,
          paid: student.paid || 'NON',
          parentalAuth: student.parentalAuth || 'NON',
          missingAuth,
          missingPaid,
          reason,
          label,
          source,
          sourceLabel
        });
      }
    };

    // 1. Matched in preview
    previewUpdateData.forEach(p => {
      checkAndAdd(p.originalStudent, p.licenseNumber, 'matched', 'Nouvelle attribution');
    });

    // 2. Selected conflicts
    conflictsData.filter(c => c.selected).forEach(c => {
      checkAndAdd(c.originalStudent, c.licenseNumber, 'conflict', 'Conflit validé');
    });

    // 3. Selected manual matches
    unmatchedUnss.filter(u => u.selectedStudentId).forEach(u => {
      const s = students.find(item => item.id === u.selectedStudentId);
      if (s) {
        checkAndAdd(s, u.licenseNumber, 'manual', 'Association manuelle');
      }
    });

    // 4. Already licensed in DB present in UNSS file
    alreadyLicensedIncomplete.forEach(s => {
      checkAndAdd(s, s.licenseNumber, 'already_in_db', 'Déjà licencié(e) (fichier UNSS)');
    });

    return list;
  };

  const exportIncompleteCsv = (customList?: any[]) => {
    const list = customList || getIncompleteLicensedStudents();
    if (list.length === 0) {
      alert("Aucun élève avec dossier incomplet à exporter.");
      return;
    }

    const headers = [
      'Nom',
      'Prénom',
      'Classe',
      'Date de Naissance',
      'N° Licence UNSS',
      'Autorisation Parentale (AP)',
      'Cotisation / Paiement',
      'Anomalie Dossier',
      'Statut Attribution'
    ];

    const rows = list.map(item => [
      item.lastName,
      item.firstName,
      item.classGroup,
      formatDateFr(item.birthDate),
      item.licenseNumber,
      item.missingAuth ? 'NON FOURNIE (Manquante)' : 'VALIDÉE (OUI)',
      item.missingPaid ? 'NON RÉGLÉ (Impayé)' : 'RÉGLÉ (OUI)',
      item.label,
      item.sourceLabel
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(';'))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recapitulatif_licencies_incomplets_${activeYear}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyIncompleteToClipboard = (customList?: any[]) => {
    const list = customList || getIncompleteLicensedStudents();
    if (list.length === 0) return;

    let text = `📋 RÉCAPITULATIF AS ROSA PARKS - ÉLÈVES LICENCIÉS AVEC DOSSIER INCOMPLET\n`;
    text += `Année scolaire : ${activeYear} | Date : ${new Date().toLocaleDateString('fr-FR')}\n`;
    text += `Total d'élèves concernés : ${list.length}\n`;
    text += `------------------------------------------------------------\n\n`;

    list.forEach((item, idx) => {
      const apStatus = item.missingAuth ? 'AP: ❌ NON FOURNIE' : 'AP: ✓ VALIDÉE';
      const payStatus = item.missingPaid ? 'Cotisation: ❌ IMPAYÉE' : 'Cotisation: ✓ RÉGLÉE';
      text += `${idx + 1}. ${item.lastName.toUpperCase()} ${item.firstName} (${item.classGroup || 'Sans classe'})\n`;
      text += `   N° Licence UNSS : ${item.licenseNumber}\n`;
      text += `   Statut : ${apStatus} | ${payStatus}\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    }).catch(() => {
      alert("Impossible de copier dans le presse-papier.");
    });
  };

  const printIncompleteReport = (customList?: any[]) => {
    const list = customList || getIncompleteLicensedStudents();
    if (list.length === 0) return;

    const printWin = window.open('', '_blank', 'height=700,width=900');
    if (!printWin) return;

    const authCount = list.filter(i => i.missingAuth).length;
    const paidCount = list.filter(i => i.missingPaid).length;
    const bothCount = list.filter(i => i.reason === 'both').length;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Récapitulatif Licenciés Dossier Incomplet - AS Rosa Parks</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #1e293b; }
            h1 { font-size: 20px; margin-bottom: 4px; color: #0f172a; }
            .subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
            .stats { display: flex; gap: 15px; margin-bottom: 20px; }
            .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; font-size: 13px; }
            .stat-box strong { font-size: 16px; display: block; color: #b45309; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 15px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
            th { background: #f1f5f9; font-weight: 600; color: #334155; }
            tr:nth-child(even) { background: #f8fafc; }
            .badge-warn { color: #dc2626; font-weight: bold; }
            .badge-ok { color: #16a34a; font-weight: bold; }
            .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Association Sportive - Collège Rosa Parks</h1>
          <div class="subtitle">Récapitulatif des élèves ayant un N° de licence UNSS avec Autorisation Parentale ou Paiement non validé (Année ${activeYear})</div>
          
          <div class="stats">
            <div class="stat-box"><strong>${list.length}</strong> Total élèves avec anomalie</div>
            <div class="stat-box"><strong>${authCount}</strong> Sans Autorisation Parentale</div>
            <div class="stat-box"><strong>${paidCount}</strong> Sans Paiement / Cotisation</div>
            <div class="stat-box"><strong>${bothCount}</strong> Sans AP ET sans Paiement</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Élève</th>
                <th>Classe</th>
                <th>Date Naiss.</th>
                <th>N° Licence UNSS</th>
                <th>Autorisation Parentale</th>
                <th>Paiement / Cotisation</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(item => `
                <tr>
                  <td><strong>${item.lastName}</strong> ${item.firstName}</td>
                  <td>${item.classGroup || '-'}</td>
                  <td>${formatDateFr(item.birthDate)}</td>
                  <td><code>${item.licenseNumber}</code></td>
                  <td>${item.missingAuth ? '<span class="badge-warn">❌ NON FOURNIE</span>' : '<span class="badge-ok">✓ Validée</span>'}</td>
                  <td>${item.missingPaid ? '<span class="badge-warn">❌ IMPAYÉ</span>' : '<span class="badge-ok">✓ Réglé</span>'}</td>
                  <td><span class="badge-warn">${item.label}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR')} - AS Rosa Parks Gestionnaire</div>
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    printWin.print();
  };

  const handleSaveAdd = async () => {
    setIsProcessing(true);
    try {
      const recordsToImport = importRecords.filter(r => r.selected).map(r => r.student);
      const recordsToDelete = missingStudents.filter(r => r.selected).map(r => r.student);

      if (recordsToImport.length > 0) {
        await batchUpsertStudentsApi(recordsToImport, activeYear);
      }

      const deleteIds = recordsToDelete.map(s => s.id).filter(Boolean);
      if (deleteIds.length > 0) {
        await deleteMultipleStudents(deleteIds);
      }
      
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'enregistrement.");
    }
    setIsProcessing(false);
  };

  const handleSaveUpdate = async () => {
    setIsProcessing(true);
    try {
      const manualMatches = unmatchedUnss
        .filter(u => u.selectedStudentId !== null)
        .map(u => ({
          id: u.selectedStudentId!,
          licenseNumber: u.licenseNumber
        }));

      const allUpdates = [
        ...previewUpdateData.map(u => ({ id: u.id, licenseNumber: u.licenseNumber })),
        ...conflictsData.filter(c => c.selected).map(c => ({
          id: c.id,
          licenseNumber: c.licenseNumber
        })),
        ...manualMatches
      ];

      if (allUpdates.length === 0) {
        alert("Aucun élève à mettre à jour.");
        setIsProcessing(false);
        return;
      }

      // Perform updates concurrently in small batches
      for (let i = 0; i < allUpdates.length; i += 20) {
        const batch = allUpdates.slice(i, i + 20);
        await Promise.all(
          batch.map(u => updateStudent(u.id, { licenseNumber: u.licenseNumber }))
        );
      }
      
      const incompleteSnapshot = getIncompleteLicensedStudents();
      setPostSyncRecap({
        totalUpdated: allUpdates.length,
        incompleteList: incompleteSnapshot
      });
      setStep(4);
      onSuccess();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la mise à jour.");
    } finally {
      setIsProcessing(false);
    }
  };

  const requiredPronote = ['lastName', 'firstName'];
  const requiredUnss = ['lastName', 'firstName', 'birthDate', 'licenseNumber'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl flex flex-col my-auto max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {step === 4 ? "Récapitulatif de synchronisation" : "Importer des données"}
            </h2>
            <p className="text-sm text-slate-500 font-medium">Pour l'année {activeYear}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="flex border-b border-slate-200">
            <button 
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${mode === 'pronote' ? 'border-slate-900 text-slate-900 bg-slate-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              onClick={() => { setMode('pronote'); setParsedData([]); }}
            >
              1. Ajouter / Compléter des élèves
            </button>
            <button 
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${mode === 'unss' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              onClick={() => { setMode('unss'); setParsedData([]); }}
            >
              2. Mettre à jour Licences (UNSS)
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-colors border-slate-300 hover:border-slate-400 bg-slate-50">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-white text-slate-400 shadow-sm">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1">
                    {mode === 'pronote' ? 'Fichier Élèves (Excel ou CSV)' : 'Fichier Licenciés UNSS (Excel ou CSV)'}
                </h3>
                <p className="text-sm text-slate-500 mb-6 max-w-sm">
                    {mode === 'pronote' ? "Importez votre fichier d'élèves pour les ajouter ou compléter leurs fiches. Formats acceptés : .xlsx, .xls, .csv" : "Importez votre fichier d'élèves pour les ajouter ou les mettre à jour. Formats acceptés : .xlsx, .xls, .csv"}
                </p>
                
                <label className="cursor-pointer bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors">
                  Sélectionner un fichier
                  <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" className="hidden" onChange={handleUpload} />
                </label>
              </div>

              {mode === 'pronote' && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-sm">Classe de rattachement (Optionnel)</h3>
                    <p className="text-xs text-slate-500 mt-1">Si vous importez une classe complète, renseignez-la ici pour l'appliquer à tous les élèves importés.</p>
                  </div>
                  <input 
                    type="text" 
                    value={targetClass}
                    onChange={e => setTargetClass(e.target.value.toUpperCase())}
                    placeholder="ex: 3EME A"
                    className="px-4 py-2 w-full sm:w-48 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-slate-500 uppercase font-medium"
                  />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
             <div className="space-y-6 animate-in fade-in zoom-in-95">
                <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 shrink-0" />
                  <div>
                    <span className="font-semibold block text-sm">Fichier analysé avec succès</span>
                    <span className="text-xs opacity-80">{parsedData.length} lignes détectées. Veuillez associer les colonnes de votre fichier avec celles de l'application.</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                      { key: 'lastName', label: 'Nom', required: true },
                      { key: 'firstName', label: 'Prénom', required: true },
                      { key: 'birthDate', label: 'Date de naissance', required: mode === 'unss' },
                      ...(mode === 'pronote' ? [
                          { key: 'classGroup', label: 'Classe', required: false },
                          { key: 'gender', label: 'Sexe/Genre', required: false },
                          { key: 'paid', label: 'Payé (OUI/NON)', required: false },
                          { key: 'amount', label: 'Montant', required: false },
                          { key: 'paymentMethod', label: 'Mode de Paiement', required: false },
                          { key: 'checkNumber', label: 'N° de Chèque', required: false },
                          { key: 'parentalAuth', label: 'Autorisation Parentale', required: false },
                          { key: 'imageRights', label: 'Droit à l\'image', required: false },
                          { key: 'swimmingCertificate', label: 'Savoir nager', required: false },
                          { key: 'tshirt', label: 'T-shirt (OUI/NON)', required: false },
                          { key: 'size', label: 'Taille', required: false }
                      ] : [
                          { key: 'licenseNumber', label: 'N° de Licence', required: true }
                      ])
                  ].map(field => (
                    <div key={field.key} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                       <label className="block text-sm font-semibold text-slate-700 mb-2">
                           {field.label} {field.required && <span className="text-red-500">*</span>}
                       </label>
                       <select
                           value={columnMapping[field.key] || ''}
                           onChange={e => setColumnMapping({...columnMapping, [field.key]: e.target.value})}
                           className={`w-full p-2 border rounded-md text-sm ${!columnMapping[field.key] && field.required ? 'border-red-300 bg-red-50 focus:ring-red-500' : 'border-slate-300 focus:ring-indigo-500'}`}
                       >
                           <option value="">-- Ignorer ou Non présent --</option>
                           {fileHeaders.map(h => (
                               <option key={h} value={h}>{h}</option>
                           ))}
                       </select>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between pt-4 border-t border-slate-100">
                  <button onClick={() => setStep(1)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors">
                    Retour
                  </button>
                  <button 
                    onClick={processMapping}
                    className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-slate-800 transition-all"
                  >
                    Valider le mapping <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
             </div>
          )}

          {step === 3 && mode === 'pronote' && (
             <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    <span className="font-medium">
                      Prêt à importer {importRecords.filter(r => r.selected).length} sur {importRecords.length} élèves détectés.
                      {importRecords.some(r => r.isDuplicate) && " Les doublons potentiels ont été ignorés par défaut."}
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto bg-white shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={importRecords.length > 0 && importRecords.every(r => r.selected)}
                            onChange={e => { 
                               const checked = e.target.checked;
                               setImportRecords(records => records.map(r => ({...r, selected: checked})));
                            }}
                          />
                        </th>
                        <th className="px-4 py-3">État</th>
                        <th className="px-4 py-3">Nom</th>
                        <th className="px-4 py-3">Prénom</th>
                        <th className="px-4 py-3">Classe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRecords.map((r, i) => (
                        <tr key={i} className={`hover:bg-slate-50 ${r.isDuplicate && !r.selected ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2">
                             <input 
                               type="checkbox" 
                               checked={r.selected}
                               onChange={e => {
                                  const checked = e.target.checked;
                                  setImportRecords(records => {
                                      const newRecords = [...records];
                                      newRecords[i] = {...newRecords[i], selected: checked};
                                      return newRecords;
                                  });
                               }}
                               className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                             />
                          </td>
                          <td className="px-4 py-2 font-medium">
                             {r.isDuplicate ? (
                                <span className="text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">Existant</span>
                             ) : (
                                <span className="text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs">Nouveau</span>
                             )}
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-900">{r.student.lastName}</td>
                          <td className="px-4 py-2">{r.student.firstName}</td>
                          <td className="px-4 py-2 font-medium">{r.student.classGroup}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {missingStudents.length > 0 && (
                  <>
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg flex items-center justify-between mt-6">
                      <div className="flex items-center gap-2">
                        <X className="w-5 h-5" />
                        <span className="font-medium">
                          {missingStudents.length} élèves actuels non trouvés dans le fichier (proposition de suppression).
                        </span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto bg-white shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">
                              <input 
                                type="checkbox" 
                                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                checked={missingStudents.length > 0 && missingStudents.every(r => r.selected)}
                                onChange={e => { 
                                   const checked = e.target.checked;
                                   setMissingStudents(records => records.map(r => ({...r, selected: checked})));
                                }}
                              />
                            </th>
                            <th className="px-4 py-3">Nom</th>
                            <th className="px-4 py-3">Prénom</th>
                            <th className="px-4 py-3">Classe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {missingStudents.map((r, i) => (
                            <tr key={i} className={`hover:bg-slate-50 ${!r.selected ? 'opacity-50' : ''}`}>
                              <td className="px-4 py-2">
                                 <input 
                                   type="checkbox" 
                                   checked={r.selected}
                                   onChange={e => {
                                      const checked = e.target.checked;
                                      setMissingStudents(records => {
                                          const newRecords = [...records];
                                          newRecords[i] = {...newRecords[i], selected: checked};
                                          return newRecords;
                                      });
                                   }}
                                   className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                 />
                              </td>
                              <td className="px-4 py-2 font-medium text-slate-900">{r.student.lastName}</td>
                              <td className="px-4 py-2">{r.student.firstName}</td>
                              <td className="px-4 py-2 font-medium">{r.student.classGroup}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div className="flex justify-between pt-4 border-t border-slate-100 mt-4">
                  <button onClick={() => setStep(2)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors">
                    Retour au mapping
                  </button>
                  <button 
                    onClick={handleSaveAdd} 
                    disabled={isProcessing || (importRecords.filter(r => r.selected).length === 0 && missingStudents.filter(r => r.selected).length === 0)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white font-medium hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    Mettre à jour la base
                  </button>
                </div>
             </div>
          )}

          {step === 3 && mode === 'unss' && (() => {
             const incompleteList = getIncompleteLicensedStudents();
             const authMissingCount = incompleteList.filter(i => i.missingAuth).length;
             const paidMissingCount = incompleteList.filter(i => i.missingPaid).length;
             const bothMissingCount = incompleteList.filter(i => i.reason === 'both').length;

             const filteredIncompleteList = incompleteList.filter(item => {
               if (incompleteReasonFilter !== 'all' && item.reason !== incompleteReasonFilter) {
                 return false;
               }
               if (incompleteSearch.trim()) {
                 const q = incompleteSearch.toLowerCase();
                 const matches = item.lastName.toLowerCase().includes(q) ||
                                 item.firstName.toLowerCase().includes(q) ||
                                 item.classGroup.toLowerCase().includes(q) ||
                                 item.licenseNumber.toLowerCase().includes(q);
                 if (!matches) return false;
               }
               return true;
             });

             const totalToUpdate = previewUpdateData.length + 
                                   conflictsData.filter(c => c.selected).length + 
                                   unmatchedUnss.filter(u => u.selectedStudentId).length;

             return (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                {/* Alerte / Bannière Récapitulatif si élèves incomplets */}
                {incompleteList.length > 0 && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-amber-900 text-sm md:text-base">
                            ⚠️ Récapitulatif : {incompleteList.length} élève(s) ayant un N° de licence ont un dossier incomplet
                          </h4>
                          <p className="text-xs text-amber-800 mt-0.5">
                            {authMissingCount} sans autorisation parentale • {paidMissingCount} avec cotisation impayée • {bothMissingCount} sans AP ni paiement
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setUnssSubTab('incomplete')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${unssSubTab === 'incomplete' ? 'bg-amber-700 text-white border-amber-800 shadow-sm' : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'}`}
                        >
                          Voir le récapitulatif ({incompleteList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => exportIncompleteCsv()}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 flex items-center gap-1.5 shadow-xs"
                          title="Télécharger le fichier CSV"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-600" /> Export CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => copyIncompleteToClipboard()}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 flex items-center gap-1.5 shadow-xs"
                          title="Copier la liste dans le presse-papier"
                        >
                          {copiedNotification ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                          {copiedNotification ? 'Copié !' : 'Copier'}
                        </button>
                        <button
                          type="button"
                          onClick={() => printIncompleteReport()}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 flex items-center gap-1.5 shadow-xs"
                          title="Imprimer le récapitulatif"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" /> Imprimer
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Barre d'onglets de navigation UNSS */}
                <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-sm">
                  <button
                    type="button"
                    onClick={() => setUnssSubTab('matched')}
                    className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${unssSubTab === 'matched' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Élèves correspondants ({previewUpdateData.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setUnssSubTab('incomplete')}
                    className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${unssSubTab === 'incomplete' ? 'border-amber-600 text-amber-900 bg-amber-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <AlertTriangle className={`w-4 h-4 ${incompleteList.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                    Récapitulatif AP / Paiement en attente
                    <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${incompleteList.length > 0 ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>
                      {incompleteList.length}
                    </span>
                  </button>

                  {conflictsData.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUnssSubTab('conflicts')}
                      className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${unssSubTab === 'conflicts' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Différences dates ({conflictsData.length})
                    </button>
                  )}

                  {unmatchedUnss.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUnssSubTab('unmatched')}
                      className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${unssSubTab === 'unmatched' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <Users className="w-4 h-4 text-rose-500" />
                      Non reconnus ({unmatchedUnss.length})
                    </button>
                  )}
                </div>

                {/* CONTENU ONGLET 1 : CORRESPONDANCES TROUVÉES */}
                {unssSubTab === 'matched' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2.5 rounded-lg flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        <span className="font-medium">{previewUpdateData.length} élèves sans licence vont recevoir leur numéro UNSS.</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto bg-white shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Élève</th>
                            <th className="px-4 py-3">Classe</th>
                            <th className="px-4 py-3">Date de Naissance</th>
                            <th className="px-4 py-3">N° Licence UNSS</th>
                            <th className="px-4 py-3">État Dossier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewUpdateData.map((u, i) => {
                            const isPaid = String(u.originalStudent.paid || '').toUpperCase().trim() === 'OUI';
                            const isAuth = String(u.originalStudent.parentalAuth || '').toUpperCase().trim() === 'OUI';
                            const isIncomplete = !isPaid || !isAuth;

                            return (
                              <tr key={i} className={`hover:bg-slate-50 ${isIncomplete ? 'bg-amber-50/20' : ''}`}>
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {u.originalStudent.lastName} {u.originalStudent.firstName}
                                </td>
                                <td className="px-4 py-3 text-slate-500">
                                  {u.originalStudent.classGroup || '-'}
                                </td>
                                <td className="px-4 py-3 text-slate-500">
                                  {formatDateFr(u.originalStudent.birthDate)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 font-mono text-xs font-semibold">
                                    {u.licenseNumber}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {isIncomplete ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {!isAuth && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200" title="Autorisation parentale manquante">
                                          AP ❌
                                        </span>
                                      )}
                                      {!isPaid && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200" title="Cotisation impayée">
                                          Cotisation ❌
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                                      ✓ Dossier complet
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {previewUpdateData.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                Aucun élève correspondant sans licence trouvé.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CONTENU ONGLET 2 : RÉCAPITULATIF DOSSIERS INCOMPLETS */}
                {unssSubTab === 'incomplete' && (
                  <div className="space-y-4">
                    {/* Filtres et recherche interne au récapitulatif */}
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setIncompleteReasonFilter('all')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${incompleteReasonFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          Tous ({incompleteList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setIncompleteReasonFilter('auth_only')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${incompleteReasonFilter === 'auth_only' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'}`}
                        >
                          AP manquante seule ({incompleteList.filter(i => i.reason === 'auth_only').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setIncompleteReasonFilter('paid_only')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${incompleteReasonFilter === 'paid_only' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'}`}
                        >
                          Cotisation manquante seule ({incompleteList.filter(i => i.reason === 'paid_only').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setIncompleteReasonFilter('both')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${incompleteReasonFilter === 'both' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'}`}
                        >
                          Les deux manquants ({bothMissingCount})
                        </button>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={incompleteSearch}
                          onChange={e => setIncompleteSearch(e.target.value)}
                          placeholder="Rechercher nom, classe..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {/* Tableau du récapitulatif détaillé */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto bg-white shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Élève</th>
                            <th className="px-4 py-3">Classe</th>
                            <th className="px-4 py-3">N° Licence UNSS</th>
                            <th className="px-4 py-3">Autorisation Parentale</th>
                            <th className="px-4 py-3">Cotisation / Paiement</th>
                            <th className="px-4 py-3">Anomalie constatée</th>
                            <th className="px-4 py-3">Origine</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredIncompleteList.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-bold text-slate-900">
                                {item.lastName} {item.firstName}
                              </td>
                              <td className="px-4 py-3 text-slate-600 font-medium">
                                {item.classGroup || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  {item.licenseNumber}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {item.missingAuth ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    ❌ Non validée
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                                    ✓ Validée
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {item.missingPaid ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    ❌ Non réglé
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                                    ✓ Réglé
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                                  {item.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 font-medium">
                                {item.sourceLabel}
                              </td>
                            </tr>
                          ))}
                          {filteredIncompleteList.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                {incompleteList.length === 0 
                                  ? "Tous les élèves ayant un numéro de licence ont leur autorisation parentale et leur paiement validés !"
                                  : "Aucun élève ne correspond aux critères de recherche actuels."
                                }
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CONTENU ONGLET 3 : DIFFÉRENCES DE DATES */}
                {unssSubTab === 'conflicts' && conflictsData.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-2">
                      <span className="font-medium text-sm">⚠️ {conflictsData.length} élèves portent le même nom, mais leur date de naissance diffère. Cochez ceux que vous souhaitez associer :</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto bg-white shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-12 text-center">
                               <input type="checkbox" 
                                      className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      checked={conflictsData.length > 0 && conflictsData.every(c => c.selected)}
                                      onChange={e => {
                                        const isChecked = e.target.checked;
                                        setConflictsData(conflictsData.map(c => ({...c, selected: isChecked})));
                                      }}
                               />
                            </th>
                            <th className="px-4 py-3">Élève</th>
                            <th className="px-4 py-3">Date base de données</th>
                            <th className="px-4 py-3">Date UNSS (Différence)</th>
                            <th className="px-4 py-3">N° Licence UNSS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {conflictsData.map((c, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-center">
                                <input type="checkbox"
                                       className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                       checked={c.selected}
                                       onChange={(e) => {
                                          const newArr = [...conflictsData];
                                          newArr[i].selected = e.target.checked;
                                          setConflictsData(newArr);
                                       }}
                                />
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-900">{c.originalStudent.lastName} {c.originalStudent.firstName}</td>
                              <td className="px-4 py-3 text-slate-500">{formatDateFr(c.originalStudent.birthDate)}</td>
                              <td className="px-4 py-3 text-amber-600 font-medium">{formatDateFr(c.unssBirthDate)}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 font-mono text-xs font-semibold">
                                  {c.licenseNumber}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CONTENU ONGLET 4 : LICENCIÉS NON RECONNUS */}
                {unssSubTab === 'unmatched' && unmatchedUnss.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg flex items-center gap-2">
                      <span className="font-medium text-sm">⚠️ {unmatchedUnss.length} licenciés UNSS n'ont pas été reconnus automatiquement. Vous pouvez les associer manuellement :</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto bg-white shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Licencié UNSS</th>
                            <th className="px-4 py-3">Date UNSS</th>
                            <th className="px-4 py-3">N° Licence</th>
                            <th className="px-4 py-3">Associer à l'élève...</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unmatchedUnss.map((u, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">{u.unssLastName} {u.unssFirstName}</td>
                              <td className="px-4 py-3 text-slate-500">{formatDateFr(u.unssBirthDate)}</td>
                              <td className="px-4 py-3 font-mono text-xs text-blue-700">{u.licenseNumber}</td>
                              <td className="px-4 py-3">
                                <select 
                                  value={u.selectedStudentId || ''}
                                  onChange={(e) => {
                                    const newArr = [...unmatchedUnss];
                                    newArr[i].selectedStudentId = e.target.value || null;
                                    setUnmatchedUnss(newArr);
                                  }}
                                  className="w-full rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500 shadow-sm"
                                >
                                  <option value="">-- Ne pas associer --</option>
                                  {students
                                    .filter(s => s.schoolYear === activeYear && !s.licenseNumber && !previewUpdateData.some(p => p.id === s.id) && !conflictsData.some(c => c.id === s.id))
                                    .sort((a, b) => a.lastName.localeCompare(b.lastName))
                                    .map(s => (
                                      <option key={s.id} value={s.id}>{s.lastName} {s.firstName} ({formatDateFr(s.birthDate)})</option>
                                    ))
                                  }
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Boutons d'action du bas */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-6">
                  <button 
                    type="button"
                    onClick={() => setStep(2)} 
                    className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-sm"
                  >
                    Retour au mapping
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveUpdate} 
                    disabled={isProcessing || totalToUpdate === 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition-all disabled:opacity-50 text-sm shadow-sm"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    Mettre à jour les profils ({totalToUpdate})
                  </button>
                </div>
              </div>
             );
          })()}

          {/* ÉTAPE 4 : RÉCAPITULATIF POST-SYNCHRONISATION COMPLET */}
          {step === 4 && postSyncRecap && (
            <div className="space-y-6 animate-in fade-in zoom-in-95">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-emerald-950 mb-1">
                  Synchronisation des licences terminée !
                </h3>
                <p className="text-emerald-800 text-sm max-w-lg mx-auto">
                  <strong>{postSyncRecap.totalUpdated} profil(s) d'élèves</strong> ont été mis à jour avec leur numéro de licence UNSS.
                </p>
              </div>

              {postSyncRecap.incompleteList.length > 0 ? (
                <div className="border border-amber-300 bg-amber-50/50 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-200 text-amber-900 rounded-lg">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-950 text-base">
                          Récapitulatif : {postSyncRecap.incompleteList.length} élève(s) ayant un N° de licence ont un dossier incomplet
                        </h4>
                        <p className="text-xs text-amber-800 mt-0.5">
                          Ces élèves possèdent désormais une licence sportive UNSS mais leur <strong>autorisation parentale</strong> ou leur <strong>cotisation</strong> n'a pas été validée.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => exportIncompleteCsv(postSyncRecap.incompleteList)}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
                      >
                        <Download className="w-4 h-4 text-slate-600" /> Télécharger CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => copyIncompleteToClipboard(postSyncRecap.incompleteList)}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
                      >
                        {copiedNotification ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                        {copiedNotification ? 'Copié !' : 'Copier la liste'}
                      </button>
                      <button
                        type="button"
                        onClick={() => printIncompleteReport(postSyncRecap.incompleteList)}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
                      >
                        <Printer className="w-4 h-4 text-slate-600" /> Imprimer
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto bg-white shadow-sm">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Élève</th>
                          <th className="px-4 py-3">Classe</th>
                          <th className="px-4 py-3">N° Licence UNSS</th>
                          <th className="px-4 py-3">Autorisation Parentale</th>
                          <th className="px-4 py-3">Cotisation</th>
                          <th className="px-4 py-3">Statut Dossier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {postSyncRecap.incompleteList.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-bold text-slate-900">
                              {item.lastName} {item.firstName}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 font-medium">
                              {item.classGroup || '-'}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {item.licenseNumber}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {item.missingAuth ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">
                                  ❌ Non validée
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                                  ✓ Validée
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {item.missingPaid ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">
                                  ❌ Non réglée
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                                  ✓ Réglée
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-900">
                                {item.label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-sm flex items-center gap-3">
                  <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Tous les élèves synchronisés ont un dossier complet (autorisation parentale et cotisation validées) !</span>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                  }}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-sm text-sm"
                >
                  Terminer et fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
