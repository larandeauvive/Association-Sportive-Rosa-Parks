import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { X, CreditCard, Search, ChevronRight, UserCheck, CheckCircle2, FileText, Printer, ArrowRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  activeYear: string;
  onOpenStudentSheet: (student: Student) => void;
}

export const CheckSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  students,
  activeYear,
  onOpenStudentSheet
}) => {
  const [query, setQuery] = useState('');
  const [filterYearOnly, setFilterYearOnly] = useState(true);

  // Filtrer les élèves selon l'année choisie
  const eligibleStudents = useMemo(() => {
    if (filterYearOnly) {
      return students.filter(s => !s.schoolYear || s.schoolYear === activeYear);
    }
    return students;
  }, [students, activeYear, filterYearOnly]);

  // Tous les élèves ayant un numéro de chèque renseigné
  const studentsWithChecks = useMemo(() => {
    return eligibleStudents.filter(s => !!(s.checkNumber && s.checkNumber.trim() !== ''));
  }, [eligibleStudents]);

  // Résultats de recherche
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Par défaut, trier par numéro de chèque ou par nom
      return studentsWithChecks;
    }

    return eligibleStudents.filter(s => {
      const check = (s.checkNumber || '').toLowerCase();
      const lastName = (s.lastName || '').toLowerCase();
      const firstName = (s.firstName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const reverseName = `${lastName} ${firstName}`.toLowerCase();
      const cls = (s.classGroup || '').toLowerCase();

      return check.includes(q) || lastName.includes(q) || firstName.includes(q) || fullName.includes(q) || reverseName.includes(q) || cls.includes(q);
    });
  }, [eligibleStudents, studentsWithChecks, query]);

  // Statistiques des chèques
  const totalCheckAmount = useMemo(() => {
    return studentsWithChecks.reduce((sum, s) => {
      const val = parseFloat((s.amount || '0').replace(',', '.'));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [studentsWithChecks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Recherche par Numéro de Chèque</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  {studentsWithChecks.length} chèque{studentsWithChecks.length > 1 ? 's' : ''} enregistré{studentsWithChecks.length > 1 ? 's' : ''}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Saisissez un numéro de chèque pour retrouver immédiatement l'élève et ouvrir sa fiche d'inscription complète
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

        {/* Search Bar Input */}
        <div className="p-5 border-b border-slate-100 bg-white space-y-3 shrink-0">
          <div className="relative">
            <Search className="w-5 h-5 text-amber-600 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tapez le numéro de chèque (ex: 849201, 74... ou nom de l'élève)"
              className="w-full pl-12 pr-10 py-3.5 bg-amber-50/50 border-2 border-amber-300 rounded-xl text-base font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition shadow-inner"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium select-none">
                <input
                  type="checkbox"
                  checked={filterYearOnly}
                  onChange={e => setFilterYearOnly(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span>Année {activeYear} uniquement</span>
              </label>
              <span>•</span>
              <span className="font-semibold text-slate-700">
                Total chèques : {totalCheckAmount.toFixed(2)} €
              </span>
            </div>

            <span className="text-[11px] font-bold text-slate-400">
              {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Results List */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
          {searchResults.length === 0 ? (
            <div className="p-10 text-center space-y-3 bg-white rounded-2xl border border-dashed border-slate-300">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">
                Aucun chèque correspondant à « {query} »
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Vérifiez la saisie du numéro. L'élève a peut-être réglé en espèces, bénéficie d'une licence gratuite, ou le chèque n'a pas encore été renseigné dans sa fiche.
              </p>
            </div>
          ) : (
            searchResults.map(student => {
              const isMatchByCheck = query.trim() !== '' && (student.checkNumber || '').toLowerCase().includes(query.trim().toLowerCase());
              const isFree = !!student.freeLicense;
              const isPaid = student.paid === 'OUI';

              return (
                <div
                  key={student.id}
                  className={`p-4 bg-white rounded-2xl border transition-all shadow-xs hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isMatchByCheck 
                      ? 'border-amber-400 ring-2 ring-amber-100' 
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 border border-amber-300 flex items-center gap-1 shadow-2xs">
                        <CreditCard className="w-3.5 h-3.5 text-amber-700" />
                        <span>N° de chèque : <strong>{student.checkNumber || 'Non renseigné'}</strong></span>
                      </span>

                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {student.classGroup || 'Classe non précisée'}
                      </span>

                      {student.schoolYear && (
                        <span className="text-[11px] text-slate-400 font-semibold">
                          {student.schoolYear}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2">
                      <h3 className="text-base font-black text-slate-900 truncate">
                        {student.lastName} {student.firstName}
                      </h3>
                      {student.licenseNumber && (
                        <span className="text-xs text-slate-400 font-mono">
                          (Lic. {student.licenseNumber})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                      <span className="font-semibold text-slate-800">
                        Montant : <strong className="text-emerald-700">{student.amount || 0} €</strong>
                      </span>
                      <span>•</span>
                      <span>Mode : {student.paymentMethod || 'Chèque'}</span>
                      <span>•</span>
                      <span>
                        Statut : {isFree ? 'Licence gratuite' : isPaid ? 'Cotisation réglée ✓' : 'En attente de validation'}
                      </span>
                      {student.tshirt && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-700 font-semibold">
                            👕 T-shirt : {student.tshirt} {student.size ? `(${student.size})` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenStudentSheet(student);
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer active:scale-95"
                      title="Accéder directement à la fiche élève complète pour modifier ses informations ou imprimer son reçu"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Accéder à la fiche élève</span>
                      <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400">
            Conseil : Vous pouvez également taper le nom ou prénom de l'élève pour vérifier le numéro de chèque enregistré.
          </p>

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
