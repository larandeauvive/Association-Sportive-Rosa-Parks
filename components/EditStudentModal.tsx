import { updateStudent, deleteStudent } from '../lib/db';
import React, { useState, useEffect } from 'react';
import { Student } from '../types';
import { X, Save, FileEdit, Trash2, CreditCard, Printer, Check } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface EditStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onSuccess: () => void;
}

export const EditStudentModal: React.FC<EditStudentModalProps> = ({
  isOpen,
  onClose,
  student,
  onSuccess
}) => {
  const [formData, setFormData] = useState<Partial<Student>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDel, setShowConfirmDel] = useState(false);

  useEffect(() => {
    if (student) {
      setFormData(student);
    }
  }, [student]);

  if (!isOpen || !student) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateStudent(student.id, {
        gender: formData.gender || 'M',
        paid: formData.freeLicense ? 'OUI' : (formData.paid || 'NON'),
        freeLicense: !!formData.freeLicense,
        paymentMethod: formData.freeLicense ? 'Gratuit' : (formData.paymentMethod || ''),
        checkNumber: formData.freeLicense ? '' : (formData.checkNumber || ''),
        amount: formData.freeLicense ? '0' : (formData.amount || ''),
        parentalAuth: formData.parentalAuth || 'NON',
        imageRights: formData.imageRights || 'NON',
        swimmingCertificate: formData.swimmingCertificate || 'NON',
        tshirt: formData.tshirt || 'NON',
        size: formData.size || '',
        licenseNumber: formData.licenseNumber || '',
        classGroup: formData.classGroup || '',
        birthDate: formData.birthDate || '',
        opussChecked: formData.opussChecked || false
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await deleteStudent(student.id);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la suppression');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintStudentRecap = () => {
    const printWin = window.open('', '_blank', 'height=750,width=850');
    if (!printWin) {
      alert("Veuillez autoriser les fenêtres pop-up pour imprimer le récapitulatif.");
      return;
    }
    const isFree = !!formData.freeLicense;
    const isPaid = formData.paid === 'OUI' || isFree;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fiche Récapitulative - ${formData.lastName || ''} ${formData.firstName || ''}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #0f172a; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
            h1 { margin: 0; font-size: 19px; color: #1e1b4b; text-transform: uppercase; font-weight: 800; }
            .sub { color: #64748b; font-size: 13px; margin-top: 3px; font-weight: 500; }
            .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; background: #f8fafc; }
            .title { font-weight: 800; font-size: 12px; text-transform: uppercase; color: #475569; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; letter-spacing: 0.5px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 13px; }
            .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13px; }
            .badge-free { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-weight: bold; border: 1px solid #fcd34d; }
            .badge-ok { display: inline-block; background: #dcfce7; color: #166534; padding: 3px 8px; border-radius: 6px; font-weight: bold; border: 1px solid #86efac; }
            .badge-no { display: inline-block; background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 6px; font-weight: bold; border: 1px solid #fca5a5; }
            .footer { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Association Sportive • Collège Rosa Parks</h1>
              <div class="sub">Fiche Récapitulative Individuelle de l'Élève &bull; Année Scolaire ${formData.schoolYear || student.schoolYear || ''}</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #64748b; font-weight: 600;">
              Édité le ${new Date().toLocaleDateString('fr-FR')}
            </div>
          </div>

          <div class="box">
            <div class="title">1. Informations Personnelles</div>
            <div class="grid">
              <div><strong>Nom :</strong> ${(formData.lastName || '').toUpperCase()}</div>
              <div><strong>Prénom :</strong> ${formData.firstName || ''}</div>
              <div><strong>Classe :</strong> ${formData.classGroup || 'Non renseignée'}</div>
              <div><strong>Date de naissance :</strong> ${formData.birthDate || 'Non renseignée'}</div>
              <div><strong>Genre / Sexe :</strong> ${formData.gender === 'F' ? 'Fille (F)' : 'Garçon (M)'}</div>
              <div><strong>N° Licence UNSS :</strong> ${formData.licenseNumber || 'En attente d\'attribution'}</div>
            </div>
          </div>

          <div class="box" style="${isFree ? 'border: 2px solid #f59e0b; background: #fffbeb;' : ''}">
            <div class="title" style="${isFree ? 'color: #b45309; border-color: #fde68a;' : ''}">2. Statut Cotisation & Règlement</div>
            <div class="grid">
              <div>
                <strong>Cotisation :</strong> 
                ${isFree 
                  ? '<span class="badge-free">✨ LICENCE GRATUITE (Prise en charge AS)</span>' 
                  : isPaid 
                    ? '<span class="badge-ok">✓ COTISATION RÉGLÉE</span>' 
                    : '<span class="badge-no">❌ IMPAYÉE (En attente)</span>'}
              </div>
              <div><strong>Montant :</strong> ${isFree ? '0 € (Dispensé de paiement)' : `${formData.amount || 0} €`}</div>
              <div><strong>Mode de paiement :</strong> ${isFree ? 'Licence gratuite accordée par l\'AS' : (formData.paymentMethod || 'Non spécifié')}</div>
              <div><strong>N° de Chèque :</strong> ${isFree ? 'Aucun (Licence gratuite)' : (formData.checkNumber || '-')}</div>
            </div>
          </div>

          <div class="box">
            <div class="title">3. Pièces Administratives & Pratique</div>
            <div class="grid-3">
              <div><strong>Autorisation Parentale :</strong> ${formData.parentalAuth === 'OUI' ? '<span class="badge-ok">✓ OUI</span>' : '<span class="badge-no">❌ NON</span>'}</div>
              <div><strong>Droit à l'image :</strong> ${formData.imageRights === 'OUI' ? '<span class="badge-ok">✓ OUI</span>' : '<span class="badge-no">❌ NON</span>'}</div>
              <div><strong>Attestation Savoir Nager :</strong> ${formData.swimmingCertificate === 'OUI' ? '<span class="badge-ok">✓ OUI</span>' : '<span class="badge-no">❌ NON</span>'}</div>
            </div>
            <div style="margin-top: 10px; font-size: 13px;">
              <strong>T-shirt / Maillot AS :</strong> ${formData.tshirt === 'OUI' ? `OUI ${formData.size ? `(Taille : ${formData.size})` : ''}` : 'NON'}
            </div>
          </div>

          <div class="footer">
            <span>Association Sportive Collège Rosa Parks — Fédération UNSS</span>
            <span>Document récapitulatif officiel</span>
          </div>
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    printWin.print();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileEdit className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-800">
                    {student.lastName} {student.firstName}
                  </h3>
                  {formData.freeLicense && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[11px] font-bold">
                      Licence gratuite
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-medium">{student.classGroup} &bull; {student.schoolYear}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintStudentRecap}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
                title="Imprimer la fiche récapitulative de l'élève"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Imprimer récap</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Genre / Sexe
                </label>
                <select
                  value={formData.gender || 'M'}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="M">Garçon (M)</option>
                  <option value="F">Fille (F)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Classe
                </label>
                <input
                  type="text"
                  value={formData.classGroup || ''}
                  onChange={(e) => setFormData({ ...formData, classGroup: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Date de naissance
                </label>
                <input
                  type="text"
                  value={formData.birthDate || ''}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  placeholder="JJ/MM/AAAA"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                N° Licence UNSS
              </label>
              <input
                type="text"
                value={formData.licenseNumber || ''}
                onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                placeholder="Ex: 06123456"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* ENCADRÉ PAIEMENT / COTISATION AVEC CASE "LICENCE GRATUITE" À CÔTÉ */}
            <div className={`p-4 rounded-xl border-2 transition-all ${
              formData.freeLicense 
                ? 'bg-amber-50/70 border-amber-300' 
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${formData.freeLicense ? 'bg-amber-100 text-amber-800' : 'bg-indigo-50 text-indigo-600'}`}>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Encadré Paiement / Cotisation
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Règlement de la cotisation annuelle à l'Association Sportive
                    </p>
                  </div>
                </div>

                {/* CASE À COCHER "LICENCE GRATUITE" À CÔTÉ DE L'ENCADRÉ */}
                <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border-2 border-amber-300 hover:border-amber-400 shadow-2xs cursor-pointer select-none transition-all">
                  <input
                    type="checkbox"
                    id="freeLicense"
                    checked={!!formData.freeLicense}
                    onChange={(e) => {
                      const isFree = e.target.checked;
                      setFormData({
                        ...formData,
                        freeLicense: isFree,
                        paid: isFree ? 'OUI' : (formData.paid === 'OUI' && formData.paymentMethod === 'Gratuit' ? 'NON' : formData.paid || 'NON'),
                        amount: isFree ? '0' : (formData.amount === '0' ? '20' : formData.amount || '20'),
                        paymentMethod: isFree ? 'Gratuit' : (formData.paymentMethod === 'Gratuit' ? '' : formData.paymentMethod || '')
                      });
                    }}
                    className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">Licence gratuite</span>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                      Dispensé
                    </span>
                  </div>
                </label>
              </div>

              {formData.freeLicense ? (
                <div className="p-3 bg-amber-100/70 border border-amber-300/80 rounded-lg text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    <div>
                      <p className="font-bold">Licence gratuite accordée — Prise en charge AS</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        L'élève est dispensé de paiement. La mention <strong>« Gratuit »</strong> est automatiquement reportée sur le récapitulatif, la fiche classe et les listings.
                      </p>
                    </div>
                  </div>
                  <div className="self-start sm:self-auto shrink-0 px-2.5 py-1 bg-white/90 rounded border border-amber-300 font-bold text-amber-900 text-xs">
                    0 € à payer
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Payé (€)
                    </label>
                    <select
                      value={formData.paid || 'NON'}
                      onChange={(e) => setFormData({ ...formData, paid: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="OUI">OUI</option>
                      <option value="NON">NON</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Montant (€)
                    </label>
                    <input
                      type="text"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="Ex: 20"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Mode
                    </label>
                    <select
                      value={formData.paymentMethod || ''}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Non spécifié --</option>
                      <option value="Espèces">Espèces</option>
                      <option value="Chèque">Chèque</option>
                      <option value="Pass'Sport">Pass'Sport</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      N° de Chèque
                    </label>
                    <input
                      type="text"
                      value={formData.checkNumber || ''}
                      onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })}
                      placeholder="Ex: 8492041"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Aut. Parentale
                </label>
                <select
                  value={formData.parentalAuth || 'NON'}
                  onChange={(e) => setFormData({ ...formData, parentalAuth: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Droit à l'image
                </label>
                <select
                  value={formData.imageRights || 'NON'}
                  onChange={(e) => setFormData({ ...formData, imageRights: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Savoir Nager
                </label>
                <select
                  value={formData.swimmingCertificate || 'NON'}
                  onChange={(e) => setFormData({ ...formData, swimmingCertificate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  T-shirt
                </label>
                <select
                  value={formData.tshirt || 'NON'}
                  onChange={(e) => setFormData({ ...formData, tshirt: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="OUI">OUI</option>
                  <option value="NON">NON</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Taille
                </label>
                <input
                  type="text"
                  value={formData.size || ''}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="Ex: M, L, 14 ans"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmDel(true)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-indigo-100 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDel}
        title="Supprimer l'élève"
        message={`Êtes-vous sûr de vouloir supprimer définitivement ${student.firstName} ${student.lastName} de la base de données ?`}
        confirmLabel="Supprimer"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirmDel(false)}
      />
    </>
  );
};

