import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { Convocation, Session, Student, Teacher } from '../types';
import { AVAILABLE_CONVOCATION_CRITERIA, getStudentCategory } from './categoryUtils';

const DEFAULT_CRITERIA_IDS = [
  'classGroup',
  'licenseNumber',
  'category',
  'parentalAuth',
  'imageRights',
  'swimmingCertificate',
  'signature',
];

const BORDER_LIGHT = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const BORDER_DARK = { style: BorderStyle.SINGLE, size: 8, color: '1E293B' };

function safeFileName(raw: string): string {
  return (raw || 'convocation')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'convocation';
}

function formatDateFr(dateStr?: string): string {
  if (!dateStr) return 'Non définie';
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parsed = new Date(`${clean}T00:00:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTimeFr(dateTimeStr?: string): string {
  if (!dateTimeStr) return 'Non spécifiée';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return dateTimeStr;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

interface WordConvocationPayload {
  title: string;
  dateLabel: string;
  meetingLocation: string;
  meetingTime: string;
  returnTime: string;
  cafeteriaTime?: string;
  guidesLabel: string;
  toBring: string[];
  description?: string;
  schoolYear: string;
  studentsList: Student[];
  criteriaIds: string[];
  tshirtManagerLabel?: string;
  snackManagersLabel?: string;
  teams?: { name: string; members: string[] }[];
  fileName: string;
}

function getCriterionCellValue(student: Student, criterionId: string, schoolYear: string): { text: string; color?: string; bold?: boolean } {
  switch (criterionId) {
    case 'classGroup':
      return { text: student.classGroup || '-', bold: true };
    case 'licenseNumber':
      return student.licenseNumber
        ? { text: student.licenseNumber }
        : { text: 'Non licencié', color: 'DC2626', bold: true };
    case 'category':
      return { text: getStudentCategory(student, schoolYear), bold: true };
    case 'birthDate':
      return { text: student.birthDate || '-' };
    case 'gender':
      return { text: student.gender || '-' };
    case 'parentalAuth':
      return String(student.parentalAuth).toUpperCase() === 'OUI'
        ? { text: '✓ Oui', color: '15803D', bold: true }
        : { text: '✗ Non', color: 'DC2626', bold: true };
    case 'imageRights':
      return String(student.imageRights).toUpperCase() === 'OUI'
        ? { text: '✓ Oui', color: '15803D', bold: true }
        : { text: '✗ Refus', color: 'D97706', bold: true };
    case 'swimmingCertificate':
      return String(student.swimmingCertificate).toUpperCase() === 'OUI'
        ? { text: '✓ Oui', color: '0369A1', bold: true }
        : { text: '✗ Non', color: '64748B' };
    case 'paid':
      return String(student.paid).toUpperCase() === 'OUI'
        ? { text: '✓ Oui', color: '15803D', bold: true }
        : { text: '✗ Non', color: 'DC2626', bold: true };
    case 'size':
      return { text: student.size || '-' };
    case 'signature':
      return { text: '' };
    default:
      return { text: '-' };
  }
}

function makeInfoCell(label: string, value: string): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    borders: {
      top: BORDER_LIGHT,
      bottom: BORDER_LIGHT,
      left: BORDER_LIGHT,
      right: BORDER_LIGHT,
    },
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: label.toUpperCase(),
            bold: true,
            size: 16,
            color: '64748B',
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: value || 'Non spécifié',
            bold: true,
            size: 21,
            color: '0F172A',
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });
}

async function generateAndDownloadDocx(payload: WordConvocationPayload): Promise<void> {
  const visibleCols = AVAILABLE_CONVOCATION_CRITERIA.filter((c) =>
    payload.criteriaIds.includes(c.id)
  );

  const infoRows: TableRow[] = [
    new TableRow({
      children: [
        makeInfoCell('Date', payload.dateLabel),
        makeInfoCell('Lieu du rendez-vous', payload.meetingLocation),
      ],
    }),
    new TableRow({
      children: [
        makeInfoCell('Heure du rendez-vous', payload.meetingTime),
        makeInfoCell('Heure de retour estimée', payload.returnTime),
      ],
    }),
    new TableRow({
      children: [
        makeInfoCell('Enseignants / Accompagnateurs', payload.guidesLabel),
        makeInfoCell(
          payload.cafeteriaTime ? 'Passage au self / À prévoir' : 'À prévoir',
          [
            payload.cafeteriaTime ? `Self : ${payload.cafeteriaTime}` : '',
            payload.toBring.length > 0 ? payload.toBring.join(' • ') : 'Tenue de sport adaptée',
          ]
            .filter(Boolean)
            .join(' — ')
        ),
      ],
    }),
  ];

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: infoRows,
  });

  // Tableau des élèves convoqués
  const headerCells: TableCell[] = [
    new TableCell({
      width: { size: 5, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: '1E293B' },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 80, right: 80 },
      borders: { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '#', bold: true, size: 18, color: 'FFFFFF', font: 'Calibri' })],
        }),
      ],
    }),
    new TableCell({
      width: { size: 23, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: '1E293B' },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 100, right: 100 },
      borders: { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK },
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'NOM & PRÉNOM', bold: true, size: 18, color: 'FFFFFF', font: 'Calibri' })],
        }),
      ],
    }),
    ...visibleCols.map((col) => {
      const shortLabel =
        col.id === 'category'
          ? 'Catégorie'
          : col.id === 'parentalAuth'
          ? 'Auto. Par.'
          : col.id === 'swimmingCertificate'
          ? 'Savoir nager'
          : col.id === 'signature'
          ? 'Signature'
          : col.label;
      return new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: '1E293B' },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 90, bottom: 90, left: 80, right: 80 },
        borders: { top: BORDER_DARK, bottom: BORDER_DARK, left: BORDER_DARK, right: BORDER_DARK },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: shortLabel.toUpperCase(),
                bold: true,
                size: 16,
                color: 'FFFFFF',
                font: 'Calibri',
              }),
            ],
          }),
        ],
      });
    }),
  ];

  const studentRows: TableRow[] =
    payload.studentsList.length > 0
      ? payload.studentsList.map((student, index) => {
          const fill = index % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
          return new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 80, bottom: 80, left: 80, right: 80 },
                borders: { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: String(index + 1), size: 18, color: '64748B', font: 'Calibri' }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                borders: { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${(student.lastName || '').toUpperCase()} ${student.firstName || ''}`.trim(),
                        bold: true,
                        size: 19,
                        color: '0F172A',
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
              ...visibleCols.map((col) => {
                const val = getCriterionCellValue(student, col.id, payload.schoolYear);
                return new TableCell({
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 80, bottom: 80, left: 80, right: 80 },
                  borders: { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: val.text,
                          bold: !!val.bold,
                          size: 18,
                          color: val.color || '1E293B',
                          font: 'Calibri',
                        }),
                      ],
                    }),
                  ],
                });
              }),
            ],
          });
        })
      : Array.from({ length: 10 }).map((_, idx) =>
          new TableRow({
            children: [
              new TableCell({
                margins: { top: 120, bottom: 120, left: 80, right: 80 },
                borders: { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: String(idx + 1), size: 18, color: '94A3B8', font: 'Calibri' })],
                  }),
                ],
              }),
              new TableCell({
                margins: { top: 120, bottom: 120, left: 100, right: 100 },
                borders: { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT },
                children: [new Paragraph({ children: [] })],
              }),
              ...visibleCols.map(
                () =>
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 80, right: 80 },
                    borders: { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT },
                    children: [new Paragraph({ children: [] })],
                  })
              ),
            ],
          })
        );

  const rosterTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headerCells,
      }),
      ...studentRows,
    ],
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: 'ASSOCIATION SPORTIVE — LYCÉE ROSA PARKS (ROSTRENEN)',
          bold: true,
          size: 18,
          color: '4338CA',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'CONVOCATION OFFICIELLE UNSS / AS',
          bold: true,
          size: 34,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: '0F172A', space: 8 },
      },
      children: [
        new TextRun({
          text: payload.title,
          bold: true,
          size: 26,
          color: '334155',
          font: 'Calibri',
        }),
      ],
    }),
    metaTable,
  ];

  if (payload.description) {
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2FF' },
        children: [
          new TextRun({
            text: 'Informations complémentaires : ',
            bold: true,
            size: 20,
            color: '312E81',
            font: 'Calibri',
          }),
          new TextRun({
            text: payload.description,
            size: 20,
            color: '1E1B4B',
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  if (payload.tshirtManagerLabel || payload.snackManagersLabel) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F0FDF4' },
        children: [
          new TextRun({
            text: 'Responsabilités désignées : ',
            bold: true,
            size: 20,
            color: '166534',
            font: 'Calibri',
          }),
          ...(payload.tshirtManagerLabel
            ? [
                new TextRun({
                  text: `Maillots : ${payload.tshirtManagerLabel}   `,
                  size: 20,
                  color: '14532D',
                  font: 'Calibri',
                }),
              ]
            : []),
          ...(payload.snackManagersLabel
            ? [
                new TextRun({
                  text: `Goûter / Pique-nique : ${payload.snackManagersLabel}`,
                  size: 20,
                  color: '14532D',
                  font: 'Calibri',
                }),
              ]
            : []),
        ],
      })
    );
  }

  if (payload.teams && payload.teams.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: `Équipes engagées (${payload.teams.length})`,
            bold: true,
            size: 22,
            color: '5B21B6',
            font: 'Calibri',
          }),
        ],
      })
    );
    payload.teams.forEach((team, idx) => {
      children.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [
            new TextRun({
              text: `${idx + 1}. ${team.name} : `,
              bold: true,
              size: 19,
              color: '0F172A',
              font: 'Calibri',
            }),
            new TextRun({
              text: team.members.join(', ') || 'Aucun membre',
              size: 19,
              color: '334155',
              font: 'Calibri',
            }),
          ],
        })
      );
    });
  }

  children.push(
    new Paragraph({
      spacing: { before: 220, after: 120 },
      children: [
        new TextRun({
          text: `Liste des élèves convoqués (${payload.studentsList.length})`,
          bold: true,
          size: 24,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    }),
    rosterTable,
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: 'Les élèves figurant sur cette liste sont autorisés à participer à la rencontre / séance aux horaires mentionnés ci-dessus. Merci de prévenir les professeurs d’EPS en cas d’empêchement.',
          italics: true,
          size: 18,
          color: '475569',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 160, after: 200 },
      children: [
        new TextRun({
          text: 'Signature / Cachet de l’enseignant responsable EPS :',
          bold: true,
          size: 19,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — Association Sportive Rosa Parks (${payload.schoolYear})`,
          size: 16,
          color: '94A3B8',
          font: 'Calibri',
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
            },
            margin: {
              top: 780,
              bottom: 780,
              left: 780,
              right: 780,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${payload.fileName}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadSessionConvocationWord(params: {
  session: Session;
  students: Student[];
  teachers?: Teacher[];
  activeYear: string;
  linkedConvocation?: Convocation | null;
}): Promise<void> {
  const { session, students, teachers = [], activeYear, linkedConvocation } = params;
  const studentIds = Array.from(
    new Set([
      ...(session.enrolledStudentIds || []),
      ...(linkedConvocation?.studentIds || []),
    ])
  );

  const studentsList = students
    .filter((s) => studentIds.includes(s.id))
    .sort((a, b) => {
      const lastCmp = (a.lastName || '').localeCompare(b.lastName || '');
      if (lastCmp !== 0) return lastCmp;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });

  const teacherIds = Array.from(
    new Set([...(session.teacherIds || []), ...(linkedConvocation?.teacherIds || [])])
  );
  const teacherNames = teacherIds
    .map((id) => teachers.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const guidesLabel =
    [teacherNames, linkedConvocation?.guides].filter(Boolean).join(', ') || 'Enseignant EPS';

  const toBring: string[] = [];
  if (session.needSnack || linkedConvocation?.needSnack === 'OUI') toBring.push('Goûter');
  if (linkedConvocation?.needPicnic === 'OUI') toBring.push('Pique-nique');

  const teams =
    session.isTeamRegistration && session.teams?.length
      ? session.teams.map((t) => ({
          name: t.name,
          members: (t.studentIds || []).map((id) => {
            const st = students.find((s) => s.id === id);
            return st ? `${st.lastName} ${st.firstName} (${st.classGroup || '-'})` : id;
          }),
        }))
      : undefined;

  const criteriaIds =
    linkedConvocation?.selectedCriteria && linkedConvocation.selectedCriteria.length > 0
      ? linkedConvocation.selectedCriteria
      : DEFAULT_CRITERIA_IDS;

  const tshirtSt = linkedConvocation?.tshirtManagerId
    ? students.find((s) => s.id === linkedConvocation.tshirtManagerId)
    : undefined;
  const snackNames = (linkedConvocation?.snackManagerIds || [])
    .map((id) => students.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `${s!.lastName} ${s!.firstName}`)
    .join(', ');

  await generateAndDownloadDocx({
    title: session.name || 'Séance / Compétition AS',
    dateLabel: formatDateFr(session.date),
    meetingLocation: session.meetingLocation || session.location || linkedConvocation?.meetingLocation || 'Non spécifié',
    meetingTime: session.meetingTime || session.time || linkedConvocation?.meetingTime || 'Non spécifiée',
    returnTime: session.returnTime || session.endTime || linkedConvocation?.returnTime || 'Non spécifiée',
    cafeteriaTime: session.cafeteriaTime || linkedConvocation?.cafeteriaTime,
    guidesLabel,
    toBring,
    description: session.description,
    schoolYear: session.schoolYear || activeYear,
    studentsList,
    criteriaIds,
    tshirtManagerLabel: tshirtSt ? `${tshirtSt.lastName} ${tshirtSt.firstName}` : undefined,
    snackManagersLabel: snackNames || undefined,
    teams,
    fileName: `convocation_${safeFileName(session.name)}_${session.date || 'seance'}`,
  });
}

export async function downloadConvocationWord(params: {
  convocation: Convocation;
  students: Student[];
  teachers?: Teacher[];
  activeYear: string;
  linkedSession?: Session | null;
}): Promise<void> {
  const { convocation, students, teachers = [], activeYear, linkedSession } = params;

  const studentIds = Array.from(
    new Set([
      ...(convocation.studentIds || []),
      ...(linkedSession?.enrolledStudentIds || []),
    ])
  );

  const studentsList = students
    .filter((s) => studentIds.includes(s.id))
    .sort((a, b) => {
      const lastCmp = (a.lastName || '').localeCompare(b.lastName || '');
      if (lastCmp !== 0) return lastCmp;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });

  const teacherIds = Array.from(
    new Set([...(convocation.teacherIds || []), ...(linkedSession?.teacherIds || [])])
  );
  const teacherNames = teacherIds
    .map((id) => teachers.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const guidesLabel = [teacherNames, convocation.guides].filter(Boolean).join(', ') || 'Aucun';

  const toBring: string[] = [];
  if (convocation.needSnack === 'OUI' || linkedSession?.needSnack) toBring.push('Goûter');
  if (convocation.needPicnic === 'OUI') toBring.push('Pique-nique');

  const criteriaIds =
    convocation.selectedCriteria && convocation.selectedCriteria.length > 0
      ? convocation.selectedCriteria
      : DEFAULT_CRITERIA_IDS;

  const tshirtSt = convocation.tshirtManagerId
    ? students.find((s) => s.id === convocation.tshirtManagerId)
    : undefined;
  const snackNames = (convocation.snackManagerIds || [])
    .map((id) => students.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `${s!.lastName} ${s!.firstName}`)
    .join(', ');

  const depDateOnly = convocation.departureDate?.split('T')[0];

  await generateAndDownloadDocx({
    title: convocation.competitionName || 'Convocation UNSS',
    dateLabel: formatDateFr(depDateOnly || convocation.departureDate),
    meetingLocation: convocation.meetingLocation || linkedSession?.meetingLocation || linkedSession?.location || 'Non spécifié',
    meetingTime: convocation.meetingTime || formatDateTimeFr(convocation.departureDate),
    returnTime: convocation.returnTime || formatDateTimeFr(convocation.returnDate),
    cafeteriaTime: convocation.cafeteriaTime || linkedSession?.cafeteriaTime,
    guidesLabel,
    toBring,
    description: linkedSession?.description,
    schoolYear: convocation.schoolYear || activeYear,
    studentsList,
    criteriaIds,
    tshirtManagerLabel: tshirtSt ? `${tshirtSt.lastName} ${tshirtSt.firstName}` : undefined,
    snackManagersLabel: snackNames || undefined,
    fileName: `convocation_${safeFileName(convocation.competitionName)}_${depDateOnly || 'unss'}`,
  });
}
