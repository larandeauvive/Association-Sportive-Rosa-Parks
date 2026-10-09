import React from 'react';
import { Student } from '../types';
import { SessionManager } from './SessionManager';
import { LogOut, GraduationCap } from 'lucide-react';

interface Props {
  students: Student[];
  activeYear: string;
  onLogout?: () => void;
}

export const TeacherPortal: React.FC<Props> = ({ students, activeYear, onLogout }) => {
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
                AS Lycée Rosa Parks • Pointage d'appel & Séances
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

      {/* Corps principal : Toutes les séances avec filtres au début & pointage mobile */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-5 lg:p-6">
        <SessionManager 
          students={students}
          activeYear={activeYear}
          defaultCategory="all"
          isTeacherView={true}
        />
      </main>
    </div>
  );
};
