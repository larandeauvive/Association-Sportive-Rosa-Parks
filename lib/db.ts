import { supabase, getSupabaseConfig } from './supabaseClient';
import { db as firestoreDb } from './firebase';
import { 
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { 
  storeSessionPdfInLocalDb, getSessionPdfFromLocalDb, deleteSessionPdfFromLocalDb 
} from './pdfStorage';
import { 
  Student, PublicStudent, Teacher, Convocation, 
  Session, EveningSlot, StaffMember, StaffAttendanceRecord 
} from '../types';
import {
  rowToStudent, studentToRow,
  rowToSession, sessionToRow,
  rowToConvocation, convocationToRow,
  rowToEveningSlot, eveningSlotToRow,
  rowToStaffMember, staffMemberToRow,
  rowToStaffAttendance, staffAttendanceToRow
} from './supabaseMappers';
import {
  getLocalStudents,
  setLocalStudents,
  saveLocalStudent,
  batchSaveLocalStudents,
  deleteLocalStudent,
  deleteMultipleLocalStudents,
  updateLocalStudent,
  updateMultipleLocalStudents,
  getLocalTeachers,
  setLocalTeachers,
  getLocalSessions,
  setLocalSessions,
  saveLocalSession,
  deleteLocalSession,
  getLocalConvocations,
  setLocalConvocations,
  saveLocalConvocation,
  deleteLocalConvocation,
  getLocalEveningSlots,
  setLocalEveningSlots,
  getLocalStaffMembers,
  setLocalStaffMembers,
  getLocalStaffAttendance,
  setLocalStaffAttendance,
  getLocalSetting,
  saveLocalSetting,
  restoreBackupToLocalStorage,
  hasLocalStudents
} from './localStorageDb';

const API_BASE = '/api';

// Cache de détection de disponibilité du serveur Express local
let _apiAvailable: boolean | null = null;
let _apiCheckPromise: Promise<boolean> | null = null;

export async function isApiServerAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (_apiAvailable !== null) return _apiAvailable;
  if (_apiCheckPromise) return _apiCheckPromise;

  _apiCheckPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${API_BASE}/health`, { 
        method: 'GET', 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        _apiAvailable = true;
        return true;
      }
    } catch {
      // Serveur absent (ex: déploiement Vercel statique)
    }
    _apiAvailable = false;
    return false;
  })();

  return _apiCheckPromise;
}

// Helper for API routes with robust HTML/JSON error detection
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = (typeof window !== 'undefined' ? localStorage.getItem('as_auth_token') : null) || 'admin-secret-passkey';
  const fullUrl = url.startsWith('http') ? url : (typeof window !== 'undefined' ? url : `http://localhost:3000${url}`);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options?.headers as Record<string, string> || {})
  };
  const res = await fetch(fullUrl, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMessage = `Erreur serveur (${res.status})`;
    if (isJson) {
      try {
        const errorBody = await res.json();
        errorMessage = errorBody.error || errorBody.message || errorMessage;
      } catch {
        // Ignorer erreur de parsing
      }
    } else {
      const text = await res.text().catch(() => '');
      if (text && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
        errorMessage = text.slice(0, 150);
      } else {
        errorMessage = `Erreur API (${res.status}): Réponse HTML inattendue.`;
      }
    }
    throw new Error(errorMessage);
  }

  if (!isJson) {
    const text = await res.text().catch(() => '');
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`Format inattendu: le serveur a renvoyé du HTML pour ${url}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  return res.json();
}

// Suivi de l'absence de tables dans Supabase
const supabaseTableMissing: Record<string, boolean> = {};

function isTableMissingInSupabase(tableName: string): boolean {
  const cfg = getSupabaseConfig();
  if (!cfg.isCustom) return true;
  return Boolean(supabaseTableMissing[tableName]);
}

function markTableMissingInSupabase(tableName: string, error: any) {
  if (error && (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache')))) {
    supabaseTableMissing[tableName] = true;
  }
}

// Safe ID generator that works even if crypto.randomUUID is not available
function generateSafeId(prefix = 'ses'): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
}

// ----------------------------------------------------
// STUDENTS (Supabase + CloudSQL API + Firestore Cloud + LocalStorage)
// ----------------------------------------------------
export const getStudents = async (schoolYear?: string): Promise<Student[]> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      let query = supabase.from('students').select('*').order('last_name', { ascending: true });
      if (schoolYear) {
        query = query.eq('school_year', schoolYear);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const mapped = data.map(rowToStudent);
        setLocalStudents(mapped);
        return mapped;
      }
    } catch {
      // fallback
    }
  }

  // 1. API CloudSQL / Express
  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const q = schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
      const apiData = await fetchJson<Student[]>(`${API_BASE}/students${q}`);
      if (apiData && apiData.length > 0) {
        setLocalStudents(apiData);
        return apiData;
      }
    } catch (apiErr) {
      console.warn('API getStudents error, fallback to Firestore:', apiErr);
    }
  }

  // 2. Base de données cloud globale : Firebase Firestore (accessible depuis Vercel et tout ordinateur)
  try {
    const snap = await getDocs(collection(firestoreDb, 'students'));
    if (!snap.empty) {
      const list: Student[] = [];
      snap.forEach(d => {
        const s = rowToStudent({ id: d.id, ...d.data() });
        if (!schoolYear || s.schoolYear === schoolYear) {
          list.push(s);
        }
      });
      list.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      if (list.length > 0) {
        setLocalStudents(list);
        return list;
      }
    }
  } catch (fsErr) {
    console.warn('Firestore getStudents error:', fsErr);
  }

  // 3. Fallback LocalStorage
  return getLocalStudents(schoolYear);
};

export const getStudentsList = getStudents;

export const getPublicDirectory = async (schoolYear: string): Promise<PublicStudent[]> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, last_name, first_name, class_group, school_year, is_adult, license_number, opuss_checked, paid, parental_auth, swimming_certificate, image_rights')
        .eq('school_year', schoolYear)
        .order('last_name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(rowToStudent) as any;
      }
    } catch {
      // fallback
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const apiData = await fetchJson<PublicStudent[]>(`${API_BASE}/public-directory?schoolYear=${encodeURIComponent(schoolYear)}`);
      if (apiData && apiData.length > 0) {
        return apiData;
      }
    } catch {
      // fallback
    }
  }

  // Firestore fallback
  try {
    const snap = await getDocs(collection(firestoreDb, 'students'));
    if (!snap.empty) {
      const list: PublicStudent[] = [];
      snap.forEach(d => {
        const s = rowToStudent({ id: d.id, ...d.data() });
        if (!schoolYear || s.schoolYear === schoolYear) {
          list.push({
            id: s.id,
            lastName: s.lastName,
            firstName: s.firstName,
            classGroup: s.classGroup,
            schoolYear: s.schoolYear,
            licenseNumber: s.licenseNumber,
            paid: s.paid,
            freeLicense: !!s.freeLicense,
            parentalAuth: s.parentalAuth,
            swimmingCertificate: s.swimmingCertificate,
            imageRights: s.imageRights,
            hasLicense: !!(s.licenseNumber && s.licenseNumber.trim().length > 0) || s.opussChecked === true || s.paid === 'OUI' || !!s.freeLicense
          });
        }
      });
      list.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      if (list.length > 0) return list;
    }
  } catch (fsErr) {
    console.warn('Firestore getPublicDirectory error:', fsErr);
  }

  const local = getLocalStudents(schoolYear);
  return local.map(s => ({
    id: s.id,
    lastName: s.lastName || '',
    firstName: s.firstName || '',
    classGroup: s.classGroup || '',
    schoolYear: s.schoolYear || '',
    paid: s.paid || 'NON',
    freeLicense: !!s.freeLicense,
    parentalAuth: s.parentalAuth || 'NON',
    swimmingCertificate: s.swimmingCertificate || 'NON',
    imageRights: s.imageRights || 'NON',
    licenseNumber: s.licenseNumber || '',
    hasLicense: !!(s.licenseNumber && s.licenseNumber.trim().length > 0) || s.opussChecked === true || s.paid === 'OUI' || !!s.freeLicense
  }));
};

export const addStudent = async (student: Omit<Student, "id">): Promise<string> => {
  const newId = generateSafeId('stu');
  const studentWithId = {
    ...student,
    id: newId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as unknown as Student;
  const row = studentToRow(studentWithId);

  // Sauvegarde locale miroir
  saveLocalStudent(studentWithId);

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'students', newId), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore addStudent error:', fsErr);
  }

  // Supabase si personnalisé
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('students').insert(row);
    } catch {
      // fallback
    }
  }

  // Serveur API
  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/students`, {
        method: 'POST',
        body: JSON.stringify(studentWithId)
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const updateStudent = async (id: string, data: Partial<Student>): Promise<void> => {
  updateLocalStudent(id, data);

  const row = studentToRow({
    ...data,
    updatedAt: new Date().toISOString()
  });

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'students', id), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore updateStudent error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('students').update(row).eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/students/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch {
      // ok
    }
  }
};

export const deleteStudent = async (id: string): Promise<void> => {
  deleteLocalStudent(id);

  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'students', id));
  } catch (fsErr) {
    console.warn('Firestore deleteStudent error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('students').delete().eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/students/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }
};

export const deleteMultipleStudents = async (ids: string[]): Promise<void> => {
  if (!ids || ids.length === 0) return;
  deleteMultipleLocalStudents(ids);

  // Firestore Cloud
  try {
    await Promise.all(ids.map(id => deleteDoc(doc(firestoreDb, 'students', id))));
  } catch (fsErr) {
    console.warn('Firestore deleteMultipleStudents error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('students').delete().in('id', ids);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/students/batch-delete`, {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
    } catch {
      // ok
    }
  }
};

export const updateMultipleStudents = async (ids: string[], data: Partial<Student>): Promise<void> => {
  if (!ids || ids.length === 0) return;
  updateMultipleLocalStudents(ids, data);

  const row = studentToRow({
    ...data,
    updatedAt: new Date().toISOString()
  });

  // Firestore Cloud
  try {
    await Promise.all(ids.map(id => setDoc(doc(firestoreDb, 'students', id), row, { merge: true })));
  } catch (fsErr) {
    console.warn('Firestore updateMultipleStudents error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('students').update(row).in('id', ids);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/students/batch-update`, {
        method: 'POST',
        body: JSON.stringify({ ids, data })
      });
    } catch {
      // ok
    }
  }
};

export const batchUpsertStudentsApi = async (students: Partial<Student>[], schoolYear: string): Promise<number> => {
  if (!students || students.length === 0) return 0;
  
  batchSaveLocalStudents(students, schoolYear);

  const now = new Date().toISOString();
  const fullStudents: Student[] = students.map(s => ({
    id: s.id || generateSafeId('stu'),
    lastName: s.lastName || '',
    firstName: s.firstName || '',
    classGroup: s.classGroup || '',
    gender: s.gender || 'M',
    schoolYear: s.schoolYear || schoolYear,
    licenseNumber: s.licenseNumber || '',
    paid: s.paid || 'NON',
    amount: s.amount || '',
    paymentMethod: s.paymentMethod || '',
    checkNumber: s.checkNumber,
    parentalAuth: s.parentalAuth || 'NON',
    imageRights: s.imageRights || 'NON',
    swimmingCertificate: s.swimmingCertificate || 'NON',
    tshirt: s.tshirt || 'NON',
    size: s.size || '',
    birthDate: s.birthDate,
    opussChecked: s.opussChecked || false,
    isAdult: s.isAdult || false,
    createdAt: s.createdAt || now,
    updatedAt: now
  }));

  // Firestore Cloud par lots
  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < fullStudents.length; i += CHUNK_SIZE) {
      const chunk = fullStudents.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(s => {
        const row = studentToRow(s);
        return setDoc(doc(firestoreDb, 'students', s.id), row, { merge: true });
      }));
    }
  } catch (fsErr) {
    console.warn('Firestore batchUpsertStudents error:', fsErr);
  }

  const rows = fullStudents.map(s => studentToRow(s));

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('students').upsert(rows);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ success: boolean; count: number }>(`${API_BASE}/students/batch-upsert`, {
        method: 'POST',
        body: JSON.stringify({ students: fullStudents, schoolYear })
      });
      return res.count;
    } catch {
      // ok
    }
  }

  return rows.length;
};

export const syncAllToPublicDirectory = async (_studentsList: Student[]): Promise<void> => {
  return;
};

// ----------------------------------------------------
// TEACHERS (Firestore + CloudSQL API + Supabase)
// ----------------------------------------------------
export const getTeachersList = async (): Promise<Teacher[]> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      const { data, error } = await supabase.from('teachers').select('*').order('name', { ascending: true });
      if (!error && data && data.length > 0) {
        const mapped = data.map((r: any) => ({ id: r.id, name: r.name }));
        setLocalTeachers(mapped);
        return mapped;
      }
    } catch {
      // fallback
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const list = await fetchJson<Teacher[]>(`${API_BASE}/teachers`);
      if (list && list.length > 0) {
        setLocalTeachers(list);
        return list;
      }
    } catch {
      // fallback
    }
  }

  // Firestore Cloud
  try {
    const snap = await getDocs(collection(firestoreDb, 'teachers'));
    if (!snap.empty) {
      const list: Teacher[] = [];
      snap.forEach(d => list.push({ id: d.id, name: d.data().name || '' }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (list.length > 0) {
        setLocalTeachers(list);
        return list;
      }
    }
  } catch (fsErr) {
    console.warn('Firestore getTeachersList error:', fsErr);
  }

  return getLocalTeachers();
};

export const addTeacherApi = async (name: string): Promise<string> => {
  const newId = generateSafeId('tea');

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'teachers', newId), { id: newId, name }, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore addTeacher error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('teachers').insert({ id: newId, name });
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/teachers`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const updateTeacherApi = async (id: string, name: string): Promise<void> => {
  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'teachers', id), { name }, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore updateTeacher error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('teachers').update({ name }).eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/teachers/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
    } catch {
      // ok
    }
  }
};

export const deleteTeacherApi = async (id: string): Promise<void> => {
  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'teachers', id));
  } catch (fsErr) {
    console.warn('Firestore deleteTeacher error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('teachers').delete().eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/teachers/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }
};

// ----------------------------------------------------
// SESSIONS & CRÉNEAUX D'ACTIVITÉS
// ----------------------------------------------------
function mergeSessionsWithLocal(remoteList: Session[], schoolYear?: string): Session[] {
  const localList = getLocalSessions(schoolYear);
  const map = new Map<string, Session>();
  for (const s of remoteList || []) {
    if (s && s.id) map.set(s.id, s);
  }
  for (const s of localList || []) {
    if (s && s.id) {
      const existing = map.get(s.id);
      if (existing) {
        // Préserver le PDF joint complet si présent dans l'un des deux
        const pdf = (existing.attachedPdf?.fileData ? existing.attachedPdf : null) ||
                    (s.attachedPdf?.fileData ? s.attachedPdf : null) ||
                    existing.attachedPdf || s.attachedPdf;
        // Fusionner les élèves inscrits pour ne jamais perdre d'inscriptions
        const mergedEnrolled = Array.from(new Set([
          ...(existing.enrolledStudentIds || []),
          ...(s.enrolledStudentIds || [])
        ]));
        const mergedPresent = Array.from(new Set([
          ...(existing.presentStudentIds || []),
          ...(s.presentStudentIds || [])
        ]));
        // Priorité aux données du serveur pour éviter d'écraser avec du local périmé
        map.set(s.id, {
          ...s,
          ...existing,
          enrolledStudentIds: mergedEnrolled,
          presentStudentIds: mergedPresent,
          attachedPdf: pdf
        });
      } else {
        map.set(s.id, s);
      }
    }
  }
  const result = Array.from(map.values());
  result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  setLocalSessions(result);
  return result;
}

export const getSessionsList = async (schoolYear?: string): Promise<Session[]> => {
  const map = new Map<string, Session>();

  // 1. API CloudSQL / Express
  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const q = schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
      const serverList = await fetchJson<Session[]>(`${API_BASE}/sessions${q}`);
      if (serverList && Array.isArray(serverList)) {
        for (const s of serverList) {
          if (s && s.id) map.set(s.id, s);
        }
      }
    } catch {
      // fallback
    }
  }

  // 2. Base Firestore Cloud (garantit que toute séance enregistrée dans le cloud est immédiatement présente)
  try {
    const fsPromise = getDocs(collection(firestoreDb, 'sessions'));
    const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500));
    const snap = await Promise.race([fsPromise, timeoutPromise]) as any;
    if (snap && !snap.empty) {
      snap.forEach((d: any) => {
        const s = rowToSession({ id: d.id, ...d.data() });
        if (!schoolYear || s.schoolYear === schoolYear) {
          if (!map.has(s.id)) {
            map.set(s.id, s);
          } else {
            const cur = map.get(s.id)!;
            const mergedEnrolled = Array.from(new Set([
              ...(cur.enrolledStudentIds || []),
              ...(s.enrolledStudentIds || [])
            ]));
            const mergedPresent = Array.from(new Set([
              ...(cur.presentStudentIds || []),
              ...(s.presentStudentIds || [])
            ]));
            map.set(s.id, {
              ...s,
              ...cur,
              enrolledStudentIds: mergedEnrolled,
              presentStudentIds: mergedPresent,
              attachedPdf: cur.attachedPdf || s.attachedPdf
            });
          }
        }
      });
    }
  } catch (fsErr) {
    // Timeout ou hors-ligne : les données de l'API serveur sont déjà dans map
  }

  if (map.size > 0) {
    const list = Array.from(map.values());
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return list;
  }

  return getLocalSessions(schoolYear);
};

export const getSession = async (id: string): Promise<Session> => {
  if (!isTableMissingInSupabase('sessions')) {
    try {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', id).single();
      if (!error && data) return rowToSession(data);
      if (error) markTableMissingInSupabase('sessions', error);
    } catch (err: any) {
      markTableMissingInSupabase('sessions', err);
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      return await fetchJson<Session>(`${API_BASE}/sessions/${encodeURIComponent(id)}`);
    } catch {
      // fallback
    }
  }

  // Firestore Cloud
  try {
    const docSnap = await getDoc(doc(firestoreDb, 'sessions', id));
    if (docSnap.exists()) {
      return rowToSession({ id: docSnap.id, ...docSnap.data() });
    }
  } catch (fsErr) {
    console.warn('Firestore getSession error:', fsErr);
  }

  const all = getLocalSessions();
  const s = all.find(item => item.id === id);
  if (!s) throw new Error('Séance introuvable');
  return s;
};

export const addSessionApi = async (data: Omit<Session, 'id'>): Promise<string> => {
  const newId = generateSafeId('ses');
  const sessionWithId = { ...data, id: newId };
  saveLocalSession(sessionWithId);

  // Sauvegarde dans IndexedDB local (sans limite de quota 5 Mo)
  if (sessionWithId.attachedPdf) {
    storeSessionPdfInLocalDb(newId, sessionWithId.attachedPdf).catch(() => {});
  }

  const row = sessionToRow(sessionWithId);

  // Firestore Cloud (écrit instantanément dans le cloud global)
  try {
    const fsRow = { ...row };
    if (fsRow.attached_pdf && typeof fsRow.attached_pdf.fileData === 'string' && fsRow.attached_pdf.fileData.length > 700000) {
      fsRow.attached_pdf = {
        fileName: fsRow.attached_pdf.fileName,
        fileSize: fsRow.attached_pdf.fileSize,
        uploadedAt: fsRow.attached_pdf.uploadedAt,
        title: fsRow.attached_pdf.title
      };
    }
    await setDoc(doc(firestoreDb, 'sessions', newId), fsRow, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore addSession error:', fsErr);
  }

  if (!isTableMissingInSupabase('sessions')) {
    try {
      const { error } = await supabase.from('sessions').insert(row);
      if (error) markTableMissingInSupabase('sessions', error);
    } catch (err: any) {
      markTableMissingInSupabase('sessions', err);
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/sessions`, {
        method: 'POST',
        body: JSON.stringify(sessionWithId)
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const updateSessionApi = async (id: string, data: Partial<Session>): Promise<void> => {
  saveLocalSession({ ...data, id });

  // Sauvegarde locale IndexedDB
  if (data.attachedPdf) {
    storeSessionPdfInLocalDb(id, data.attachedPdf).catch(() => {});
  } else if (data.attachedPdf === null) {
    deleteSessionPdfFromLocalDb(id).catch(() => {});
  }

  const row = sessionToRow(data);

  // Firestore Cloud : éviter le rejet si le document dépasse 1Mo
  try {
    const fsRow = { ...row };
    if (fsRow.attached_pdf && typeof fsRow.attached_pdf.fileData === 'string' && fsRow.attached_pdf.fileData.length > 700000) {
      fsRow.attached_pdf = {
        fileName: fsRow.attached_pdf.fileName,
        fileSize: fsRow.attached_pdf.fileSize,
        uploadedAt: fsRow.attached_pdf.uploadedAt,
        title: fsRow.attached_pdf.title
      };
    }
    await setDoc(doc(firestoreDb, 'sessions', id), fsRow, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore updateSession error:', fsErr);
  }

  if (!isTableMissingInSupabase('sessions')) {
    try {
      const { error } = await supabase.from('sessions').update(row).eq('id', id);
      if (error) markTableMissingInSupabase('sessions', error);
    } catch (err: any) {
      markTableMissingInSupabase('sessions', err);
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (sErr) {
      console.warn('Erreur mise à jour serveur local session:', sErr);
    }
  }
};

export const saveSessionApi = async (data: Partial<Session> & { id?: string }): Promise<{ id: string }> => {
  try {
    if (data.id) {
      const { id, ...rest } = data;
      await updateSessionApi(id, rest);
      return { id };
    } else {
      const newId = await addSessionApi(data as Omit<Session, 'id'>);
      return { id: newId };
    }
  } catch (err) {
    const fallbackId = data.id || generateSafeId('ses');
    saveLocalSession({ ...data, id: fallbackId });
    if (data.attachedPdf) {
      storeSessionPdfInLocalDb(fallbackId, data.attachedPdf).catch(() => {});
    }
    return { id: fallbackId };
  }
};

export const deleteSessionApi = async (id: string): Promise<void> => {
  deleteLocalSession(id);
  deleteSessionPdfFromLocalDb(id).catch(() => {});

  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'sessions', id));
  } catch (fsErr) {
    console.warn('Firestore deleteSession error:', fsErr);
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }

  if (!isTableMissingInSupabase('sessions')) {
    try {
      await supabase.from('sessions').delete().eq('id', id);
    } catch {
      // ok
    }
  }
};

export const enrollInSession = async (sessionId: string, studentId: string): Promise<void> => {
  const localSessions = getLocalSessions();
  const localSes = localSessions.find(s => s.id === sessionId);
  let convId: string | undefined = localSes?.convocationId;

  if (localSes?.blockOnlineRegistration) {
    throw new Error(localSes.directRegistrationNotice || "L'inscription en ligne est bloquée pour cette séance.");
  }

  if (localSes) {
    const currentEnrolled = Array.from(new Set([...(localSes.enrolledStudentIds || []), studentId]));
    saveLocalSession({ ...localSes, enrolledStudentIds: currentEnrolled });
    
    const localConvs = getLocalConvocations();
    const linkedConvs = localConvs.filter(c => c.id === localSes.convocationId || c.sessionId === sessionId);
    linkedConvs.forEach(linkedConv => {
      const convEnrolled = Array.from(new Set([...(linkedConv.studentIds || []), studentId]));
      saveLocalConvocation({ ...linkedConv, studentIds: convEnrolled });
    });
  }

  // Firestore Cloud
  try {
    const sDocRef = doc(firestoreDb, 'sessions', sessionId);
    const sDocSnap = await getDoc(sDocRef);
    if (sDocSnap.exists()) {
      const sData = sDocSnap.data();
      const currentList: string[] = sData.enrolled_student_ids || sData.enrolledStudentIds || [];
      const updatedList = Array.from(new Set([...currentList, studentId]));
      await setDoc(sDocRef, { 
        enrolled_student_ids: updatedList, 
        enrolledStudentIds: updatedList 
      }, { merge: true });

      const linkedConvId = sData.convocation_id || sData.convocationId || convId;
      if (linkedConvId) {
        const cDocRef = doc(firestoreDb, 'convocations', linkedConvId);
        const cDocSnap = await getDoc(cDocRef);
        if (cDocSnap.exists()) {
          const cData = cDocSnap.data();
          const cList: string[] = cData.student_ids || cData.studentIds || [];
          const updatedCList = Array.from(new Set([...cList, studentId]));
          await setDoc(cDocRef, { 
            student_ids: updatedCList, 
            studentIds: updatedCList 
          }, { merge: true });
        }
      }
    }
  } catch (fsErr) {
    console.warn('Firestore enroll error:', fsErr);
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ studentId })
      });
    } catch {
      // ok
    }
  }

  if (!isTableMissingInSupabase('sessions')) {
    try {
      const { data: currentSession } = await supabase
        .from('sessions')
        .select('enrolled_student_ids, max_participants, convocation_id')
        .eq('id', sessionId)
        .single();

      if (currentSession) {
        const enrolledList: string[] = currentSession.enrolled_student_ids || [];
        if (!enrolledList.includes(studentId)) {
          enrolledList.push(studentId);
          await supabase.from('sessions').update({ enrolled_student_ids: enrolledList }).eq('id', sessionId);
          if (currentSession.convocation_id) {
            try {
              const { data: convData } = await supabase
                .from('convocations')
                .select('student_ids')
                .eq('id', currentSession.convocation_id)
                .single();
              const convList = Array.from(new Set([...(convData?.student_ids || []), studentId]));
              await supabase.from('convocations').update({ student_ids: convList }).eq('id', currentSession.convocation_id);
            } catch {
              // ok
            }
          }
        }
      }
    } catch {
      // ok
    }
  }
};

export const enrollTeamInSession = async (
  sessionId: string,
  teamName: string,
  studentIds: string[]
): Promise<{ id: string; name: string; studentIds: string[]; createdAt: string }> => {
  const newTeam = {
    id: 'team_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
    name: teamName.trim() || 'Équipe',
    studentIds: Array.from(new Set(studentIds)),
    createdAt: new Date().toISOString()
  };

  try {
    const session = await getSession(sessionId);
    if (!session) throw new Error('Séance introuvable');

    const currentEnrolled = new Set(session.enrolledStudentIds || []);
    newTeam.studentIds.forEach(id => currentEnrolled.add(id));

    const currentTeams = [...(session.teams || [])];
    currentTeams.push(newTeam);

    await saveSessionApi({
      id: sessionId,
      enrolledStudentIds: Array.from(currentEnrolled),
      teams: currentTeams
    });

    return newTeam;
  } catch (err) {
    console.warn('Error in enrollTeamInSession:', err);
    return newTeam;
  }
};

export const deleteTeamFromSession = async (
  sessionId: string,
  teamId: string
): Promise<void> => {
  try {
    const session = await getSession(sessionId);
    if (!session) return;

    const teamToRemove = (session.teams || []).find(t => t.id === teamId);
    const updatedTeams = (session.teams || []).filter(t => t.id !== teamId);
    
    let updatedEnrolled = session.enrolledStudentIds || [];
    if (teamToRemove) {
      const otherTeamStudentIds = new Set(updatedTeams.flatMap(t => t.studentIds));
      updatedEnrolled = updatedEnrolled.filter(id => otherTeamStudentIds.has(id));
    }

    await saveSessionApi({
      id: sessionId,
      teams: updatedTeams,
      enrolledStudentIds: updatedEnrolled
    });
  } catch (err) {
    console.error('Error deleteTeamFromSession:', err);
  }
};

// ----------------------------------------------------
// CONVOCATIONS
// ----------------------------------------------------
function mergeConvocationsWithLocal(remoteList: Convocation[], schoolYear?: string): Convocation[] {
  const localList = getLocalConvocations(schoolYear);
  const map = new Map<string, Convocation>();
  for (const c of remoteList || []) {
    if (c && c.id) map.set(c.id, c);
  }
  for (const c of localList || []) {
    if (c && c.id) {
      const existing = map.get(c.id);
      if (existing) {
        // Fusionner les élèves inscrits/convoqués pour ne jamais perdre d'inscriptions
        const mergedStudents = Array.from(new Set([
          ...(existing.studentIds || []),
          ...(c.studentIds || [])
        ]));
        // Priorité aux données du serveur pour éviter d'écraser avec du local périmé
        map.set(c.id, {
          ...c,
          ...existing,
          studentIds: mergedStudents
        });
      } else {
        map.set(c.id, c);
      }
    }
  }
  const result = Array.from(map.values());
  result.sort((a, b) => new Date(b.departureDate).getTime() - new Date(a.departureDate).getTime());
  setLocalConvocations(result);
  return result;
}

export const getConvocationsList = async (schoolYear?: string): Promise<Convocation[]> => {
  if (!isTableMissingInSupabase('convocations')) {
    try {
      let query = supabase.from('convocations').select('*').order('departure_date', { ascending: false });
      if (schoolYear) {
        query = query.eq('school_year', schoolYear);
      }
      const { data, error } = await query;
      if (error) {
        markTableMissingInSupabase('convocations', error);
      } else {
        const mapped = (data || []).map(rowToConvocation);
        return mergeConvocationsWithLocal(mapped, schoolYear);
      }
    } catch (err: any) {
      markTableMissingInSupabase('convocations', err);
    }
  }

  const map = new Map<string, Convocation>();

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const queryStr = schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
      const serverList = await fetchJson<Convocation[]>(`${API_BASE}/convocations${queryStr}`);
      if (serverList && Array.isArray(serverList)) {
        for (const c of serverList) {
          if (c && c.id) map.set(c.id, c);
        }
      }
    } catch {
      // fallback
    }
  }

  // Firestore Cloud
  try {
    const fsPromise = getDocs(collection(firestoreDb, 'convocations'));
    const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500));
    const snap = await Promise.race([fsPromise, timeoutPromise]) as any;
    if (snap && !snap.empty) {
      snap.forEach((d: any) => {
        const c = rowToConvocation({ id: d.id, ...d.data() });
        if (!schoolYear || c.schoolYear === schoolYear) {
          if (!map.has(c.id)) {
            map.set(c.id, c);
          } else {
            const cur = map.get(c.id)!;
            const mergedStudents = Array.from(new Set([
              ...(cur.studentIds || []),
              ...(c.studentIds || [])
            ]));
            map.set(c.id, {
              ...c,
              ...cur,
              studentIds: mergedStudents
            });
          }
        }
      });
    }
  } catch (fsErr) {
    // Timeout ou hors-ligne
  }

  if (map.size > 0) {
    return mergeConvocationsWithLocal(Array.from(map.values()), schoolYear);
  }

  return getLocalConvocations(schoolYear);
};

export const addConvocationApi = async (data: Omit<Convocation, 'id'>): Promise<string> => {
  const newId = generateSafeId('cnv');
  const convWithId = { ...data, id: newId };
  saveLocalConvocation(convWithId);

  const row = convocationToRow(convWithId);

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'convocations', newId), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore addConvocation error:', fsErr);
  }

  if (!isTableMissingInSupabase('convocations')) {
    try {
      const { error } = await supabase.from('convocations').insert(row);
      if (error) markTableMissingInSupabase('convocations', error);
    } catch (err: any) {
      markTableMissingInSupabase('convocations', err);
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/convocations`, {
        method: 'POST',
        body: JSON.stringify(convWithId)
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const updateConvocationApi = async (id: string, data: Partial<Convocation>): Promise<void> => {
  saveLocalConvocation({ ...data, id });

  const row = convocationToRow(data);

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'convocations', id), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore updateConvocation error:', fsErr);
  }

  if (!isTableMissingInSupabase('convocations')) {
    try {
      const { error } = await supabase.from('convocations').update(row).eq('id', id);
      if (error) markTableMissingInSupabase('convocations', error);
    } catch (err: any) {
      markTableMissingInSupabase('convocations', err);
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/convocations/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch {
      // ok
    }
  }
};

export const saveConvocationApi = async (data: Partial<Convocation> & { id?: string }): Promise<{ id: string }> => {
  try {
    if (data.id) {
      const { id, ...rest } = data;
      await updateConvocationApi(id, rest);
      return { id };
    } else {
      const newId = await addConvocationApi(data as Omit<Convocation, 'id'>);
      return { id: newId };
    }
  } catch (err) {
    const fallbackId = data.id || generateSafeId('cnv');
    saveLocalConvocation({ ...data, id: fallbackId });
    return { id: fallbackId };
  }
};

export const deleteConvocationApi = async (id: string): Promise<void> => {
  deleteLocalConvocation(id);

  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'convocations', id));
  } catch (fsErr) {
    console.warn('Firestore deleteConvocation error:', fsErr);
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/convocations/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }

  if (!isTableMissingInSupabase('convocations')) {
    try {
      await supabase.from('convocations').delete().eq('id', id);
    } catch {
      // ok
    }
  }
};

// ----------------------------------------------------
// STAFF & EVENING SLOTS
// ----------------------------------------------------
export const getEveningSlotsList = async (schoolYear?: string): Promise<EveningSlot[]> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      let query = supabase.from('evening_slots').select('*');
      if (schoolYear) query = query.eq('school_year', schoolYear);
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data.map(rowToEveningSlot);
    } catch {
      // fallback
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const query = schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
      const list = await fetchJson<EveningSlot[]>(`${API_BASE}/evening-slots${query}`);
      if (list && list.length > 0) return list;
    } catch {
      // fallback
    }
  }

  // Firestore Cloud
  try {
    const snap = await getDocs(collection(firestoreDb, 'evening_slots'));
    if (!snap.empty) {
      const list: EveningSlot[] = [];
      snap.forEach(d => {
        const item = rowToEveningSlot({ id: d.id, ...d.data() });
        if (!schoolYear || item.schoolYear === schoolYear) list.push(item);
      });
      if (list.length > 0) return list;
    }
  } catch (fsErr) {
    console.warn('Firestore getEveningSlotsList error:', fsErr);
  }

  return getLocalEveningSlots(schoolYear);
};

export const saveEveningSlotApi = async (slot: Omit<EveningSlot, 'id'> & { id?: string }): Promise<string> => {
  const newId = slot.id || generateSafeId('esl');
  const row = eveningSlotToRow({ ...slot, id: newId });

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'evening_slots', newId), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore saveEveningSlot error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('evening_slots').upsert(row);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/evening-slots`, {
        method: 'POST',
        body: JSON.stringify(slot)
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const deleteEveningSlotApi = async (id: string): Promise<void> => {
  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'evening_slots', id));
  } catch (fsErr) {
    console.warn('Firestore deleteEveningSlot error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('evening_slots').delete().eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/evening-slots/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }
};

export const getStaffMembersList = async (schoolYear?: string): Promise<StaffMember[]> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      let query = supabase.from('staff_members').select('*');
      if (schoolYear) query = query.eq('school_year', schoolYear);
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data.map(rowToStaffMember);
    } catch {
      // fallback
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const query = schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
      const list = await fetchJson<StaffMember[]>(`${API_BASE}/staff-members${query}`);
      if (list && list.length > 0) return list;
    } catch {
      // fallback
    }
  }

  // Firestore Cloud
  try {
    const snap = await getDocs(collection(firestoreDb, 'staff_members'));
    if (!snap.empty) {
      const list: StaffMember[] = [];
      snap.forEach(d => {
        const item = rowToStaffMember({ id: d.id, ...d.data() });
        if (!schoolYear || item.schoolYear === schoolYear) list.push(item);
      });
      if (list.length > 0) return list;
    }
  } catch (fsErr) {
    console.warn('Firestore getStaffMembersList error:', fsErr);
  }

  return getLocalStaffMembers(schoolYear);
};

export const saveStaffMemberApi = async (data: Omit<StaffMember, 'id'> & { id?: string }): Promise<string> => {
  const newId = data.id || generateSafeId('stf');
  const now = new Date().toISOString();
  const row = staffMemberToRow({
    ...data,
    id: newId,
    updatedAt: now,
    createdAt: data.createdAt || now
  });

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'staff_members', newId), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore saveStaffMember error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('staff_members').upsert(row);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/staff-members`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const deleteStaffMemberApi = async (id: string): Promise<void> => {
  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'staff_members', id));
  } catch (fsErr) {
    console.warn('Firestore deleteStaffMember error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('staff_members').delete().eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/staff-members/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }
};

export const getStaffAttendanceList = async (schoolYear?: string): Promise<StaffAttendanceRecord[]> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      let query = supabase.from('staff_attendance').select('*').order('date', { ascending: false });
      if (schoolYear) query = query.eq('school_year', schoolYear);
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data.map(rowToStaffAttendance);
    } catch {
      // fallback
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const query = schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
      const list = await fetchJson<StaffAttendanceRecord[]>(`${API_BASE}/staff-attendance${query}`);
      if (list && list.length > 0) return list;
    } catch {
      // fallback
    }
  }

  // Firestore Cloud
  try {
    const snap = await getDocs(collection(firestoreDb, 'staff_attendance'));
    if (!snap.empty) {
      const list: StaffAttendanceRecord[] = [];
      snap.forEach(d => {
        const item = rowToStaffAttendance({ id: d.id, ...d.data() });
        if (!schoolYear || item.schoolYear === schoolYear) list.push(item);
      });
      if (list.length > 0) return list;
    }
  } catch (fsErr) {
    console.warn('Firestore getStaffAttendanceList error:', fsErr);
  }

  return getLocalStaffAttendance(schoolYear);
};

export const saveStaffAttendanceApi = async (record: Omit<StaffAttendanceRecord, 'id'> & { id?: string }): Promise<string> => {
  const newId = record.id || generateSafeId('att');
  const row = staffAttendanceToRow({
    ...record,
    id: newId,
    createdAt: record.createdAt || new Date().toISOString()
  });

  // Firestore Cloud
  try {
    await setDoc(doc(firestoreDb, 'staff_attendance', newId), row, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore saveStaffAttendance error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('staff_attendance').upsert(row);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<{ id: string }>(`${API_BASE}/staff-attendance`, {
        method: 'POST',
        body: JSON.stringify(record)
      });
      return res.id || newId;
    } catch {
      // ok
    }
  }

  return newId;
};

export const deleteStaffAttendanceApi = async (id: string): Promise<void> => {
  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'staff_attendance', id));
  } catch (fsErr) {
    console.warn('Firestore deleteStaffAttendance error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('staff_attendance').delete().eq('id', id);
    } catch {
      // ok
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/staff-attendance/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch {
      // ok
    }
  }
};

// ----------------------------------------------------
// SETTINGS & REGISTRATION FORM
// ----------------------------------------------------
export const getAppSetting = async <T = any>(key: string, defaultValue?: T): Promise<T | null> => {
  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).single();
      if (!error && data) {
        try {
          const parsed = JSON.parse(data.value);
          saveLocalSetting(key, parsed);
          return parsed;
        } catch {
          saveLocalSetting(key, data.value);
          return data.value as unknown as T;
        }
      }
    } catch {
      // fallback
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      const res = await fetchJson<T>(`${API_BASE}/settings/${encodeURIComponent(key)}`);
      if (res !== null && res !== undefined) {
        saveLocalSetting(key, res);
        return res;
      }
    } catch {
      // ignore
    }
  }

  // Firestore Cloud
  try {
    const snap = await getDoc(doc(firestoreDb, 'settings', key));
    if (snap.exists()) {
      const val = snap.data() as T;
      saveLocalSetting(key, val);
      return val;
    }
  } catch (fsErr) {
    console.warn('Firestore getAppSetting error:', fsErr);
  }

  return getLocalSetting<T>(key, defaultValue !== undefined ? defaultValue : (null as unknown as T));
};

export const saveAppSetting = async <T = any>(key: string, value: T): Promise<void> => {
  saveLocalSetting(key, value);

  // Firestore Cloud
  try {
    const dataToSave = typeof value === 'object' && value !== null ? value : { value };
    await setDoc(doc(firestoreDb, 'settings', key), dataToSave, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore saveAppSetting error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      await supabase.from('app_settings').upsert({
        key,
        value: strValue,
        updated_at: new Date().toISOString()
      });
    } catch {
      // ignore
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/settings/${encodeURIComponent(key)}`, {
        method: 'POST',
        body: JSON.stringify(value)
      });
    } catch {
      // Handled by local storage
    }
  }
};

export const deleteAppSetting = async (key: string): Promise<void> => {
  // Firestore Cloud
  try {
    await deleteDoc(doc(firestoreDb, 'settings', key));
  } catch (fsErr) {
    console.warn('Firestore deleteAppSetting error:', fsErr);
  }

  const cfg = getSupabaseConfig();
  if (cfg.isCustom) {
    try {
      await supabase.from('app_settings').delete().eq('key', key);
    } catch {
      // ignore
    }
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/settings/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
    } catch {
      // ignore
    }
  }
};

// ----------------------------------------------------
// BACKUP & RESET
// ----------------------------------------------------
export const fetchBackup = async (): Promise<Record<string, any[]>> => {
  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      return await fetchJson<Record<string, any[]>>(`${API_BASE}/backup`);
    } catch {
      // fallback
    }
  }

  return {
    students: getLocalStudents(),
    teachers: getLocalTeachers(),
    sessions: getLocalSessions(),
    convocations: getLocalConvocations(),
    evening_slots: getLocalEveningSlots(),
    staff_members: getLocalStaffMembers(),
    staff_attendance: getLocalStaffAttendance()
  };
};

export const restoreBackup = async (data: Record<string, any[]>): Promise<void> => {
  restoreBackupToLocalStorage(data);

  // Firestore Cloud restoration
  try {
    if (data.students && Array.isArray(data.students)) {
      await batchUpsertStudentsApi(data.students, '2026-2027');
    }
    if (data.sessions && Array.isArray(data.sessions)) {
      for (const s of data.sessions) {
        if (s.id) await setDoc(doc(firestoreDb, 'sessions', s.id), sessionToRow(s), { merge: true });
      }
    }
    if (data.convocations && Array.isArray(data.convocations)) {
      for (const c of data.convocations) {
        if (c.id) await setDoc(doc(firestoreDb, 'convocations', c.id), convocationToRow(c), { merge: true });
      }
    }
    if (data.teachers && Array.isArray(data.teachers)) {
      for (const t of data.teachers) {
        if (t.id) await setDoc(doc(firestoreDb, 'teachers', t.id), { id: t.id, name: t.name }, { merge: true });
      }
    }
  } catch (fsErr) {
    console.warn('Firestore restoreBackup error:', fsErr);
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/restore`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch {
      // Handled
    }
  }
};

export const resetDatabaseApi = async (type: 'calendar' | 'all'): Promise<void> => {
  if (type === 'all') {
    setLocalStudents([]);
    setLocalSessions([]);
    setLocalConvocations([]);
    setLocalEveningSlots([]);
    setLocalStaffMembers([]);
    setLocalStaffAttendance([]);
  } else if (type === 'calendar') {
    setLocalSessions([]);
    setLocalConvocations([]);
    setLocalEveningSlots([]);
  }

  const hasServer = await isApiServerAvailable();
  if (hasServer) {
    try {
      await fetchJson(`${API_BASE}/reset`, {
        method: 'POST',
        body: JSON.stringify({ type })
      });
    } catch {
      // Handled by local storage
    }
  }
};
