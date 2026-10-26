import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { LoadingService } from '../../core/loading/loading.service';
import {
  Exam,
  ExamAnswer,
  ExamGrade,
  ExamKey,
  ExamSubmission,
  submissionId,
} from '../../core/models/exam';

/** What staff fill in to build a form. */
export type ExamInput = Omit<
  Exam,
  'id' | 'opensAt' | 'closesAt' | 'createdBy' | 'createdAt' | 'updatedAt'
> & { opensAt: Date; closesAt: Date };

/** What staff set when grading an attempt. */
export type GradeInput = Pick<
  ExamGrade,
  'examId' | 'uid' | 'attempt' | 'scores' | 'comments' | 'feedback' | 'total' | 'passed'
>;

/**
 * Evaluation forms (`examForms`), their answer keys (`examKeys`), the students' attempts
 * (`examSubmissions`) and the staff's grades (`examGrades`); see `firestore.rules`.
 */
@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);

  private readonly forms = collection(this.firestore, 'examForms');
  private readonly keys = collection(this.firestore, 'examKeys');
  private readonly submissionsRef = collection(this.firestore, 'examSubmissions');
  private readonly gradesRef = collection(this.firestore, 'examGrades');

  // Staff

  /** Every form, newest window first. */
  async all(): Promise<Exam[]> {
    const snapshot = await this.loading.track(getDocs(this.forms));
    return sortByWindow(snapshot.docs.map((d) => ({ ...(d.data() as Exam), id: d.id })));
  }

  async get(id: string): Promise<Exam | null> {
    const snapshot = await this.loading.track(getDoc(doc(this.forms, id)));
    return snapshot.exists() ? { ...(snapshot.data() as Exam), id: snapshot.id } : null;
  }

  /** The right answers (staff, or students once published with answers). */
  async key(id: string): Promise<ExamKey> {
    const snapshot = await this.loading.track(getDoc(doc(this.keys, id)));
    return { answers: (snapshot.data() as ExamKey | undefined)?.answers ?? {} };
  }

  /** Saves the form and its answer key together; returns the form's id. */
  async save(id: string | null, input: ExamInput, key: ExamKey): Promise<string> {
    const ref = id ? doc(this.forms, id) : doc(this.forms);
    const batch = writeBatch(this.firestore);
    if (id) {
      batch.update(ref, { ...input, updatedAt: serverTimestamp() });
    } else {
      batch.set(ref, {
        ...input,
        createdBy: this.auth.user()?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(doc(this.keys, ref.id), { answers: key.answers, updatedAt: serverTimestamp() });
    await batch.commit();
    return ref.id;
  }

  setResults(id: string, change: Pick<Exam, 'resultsPublished' | 'showAnswers'>): Promise<void> {
    return updateDoc(doc(this.forms, id), { ...change, updatedAt: serverTimestamp() });
  }

  /** Deletes the form and its key; attempts and grades stay for the record. */
  async remove(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.forms, id));
    batch.delete(doc(this.keys, id));
    await batch.commit();
  }

  async submissions(examId: string): Promise<ExamSubmission[]> {
    const snapshot = await this.loading.track(
      getDocs(query(this.submissionsRef, where('examId', '==', examId))),
    );
    return snapshot.docs.map((d) => ({ ...(d.data() as ExamSubmission), id: d.id }));
  }

  async grades(examId: string): Promise<ExamGrade[]> {
    const snapshot = await this.loading.track(
      getDocs(query(this.gradesRef, where('examId', '==', examId))),
    );
    return snapshot.docs.map((d) => ({ ...(d.data() as ExamGrade), id: d.id }));
  }

  async saveGrade(grade: GradeInput): Promise<void> {
    await setDoc(doc(this.gradesRef, submissionId(grade.examId, grade.uid, grade.attempt)), {
      ...grade,
      gradedBy: this.auth.user()?.uid,
      gradedAt: serverTimestamp(),
    });
  }

  // Students

  /** Published forms for everyone plus the ones assigned to the student. */
  async assignedTo(uid: string): Promise<Exam[]> {
    const published = where('published', '==', true);
    const [forAll, forMe] = await this.loading.track(
      Promise.all([
        getDocs(query(this.forms, published, where('audience', '==', 'all'))),
        getDocs(query(this.forms, published, where('studentIds', 'array-contains', uid))),
      ]),
    );
    const byId = new Map<string, Exam>();
    for (const d of [...forAll.docs, ...forMe.docs]) {
      byId.set(d.id, { ...(d.data() as Exam), id: d.id });
    }
    return sortByWindow([...byId.values()]);
  }

  /** The student's attempts, optionally of one form. */
  async mySubmissions(uid: string, examId?: string): Promise<ExamSubmission[]> {
    const filters = [where('uid', '==', uid)];
    if (examId) {
      filters.push(where('examId', '==', examId));
    }
    const snapshot = await this.loading.track(getDocs(query(this.submissionsRef, ...filters)));
    return snapshot.docs
      .map((d) => ({ ...(d.data() as ExamSubmission), id: d.id }))
      .sort((a, b) => a.attempt - b.attempt);
  }

  /** The student's published grades for these attempts (missing ones are left out). */
  async myGrades(submissions: ExamSubmission[]): Promise<ExamGrade[]> {
    const grades = await this.loading.track(
      Promise.all(
        submissions.map((s) =>
          getDoc(doc(this.gradesRef, s.id)).then(
            (d) => (d.exists() ? { ...(d.data() as ExamGrade), id: d.id } : null),
            () => null,
          ),
        ),
      ),
    );
    return grades.filter((g): g is ExamGrade => g !== null);
  }

  /** Starts attempt `attempt` of a form; returns its id. */
  async start(exam: Exam, attempt: number): Promise<string> {
    const user = this.auth.user();
    const uid = user?.uid ?? '';
    const id = submissionId(exam.id, uid, attempt);
    await setDoc(doc(this.submissionsRef, id), {
      examId: exam.id,
      uid,
      userName: (this.auth.profile()?.displayName || user?.email || '').slice(0, 120),
      attempt,
      status: 'inProgress',
      answers: {},
      startedAt: serverTimestamp(),
      submittedAt: null,
    });
    return id;
  }

  async getSubmission(id: string): Promise<ExamSubmission | null> {
    const snapshot = await getDoc(doc(this.submissionsRef, id));
    return snapshot.exists() ? { ...(snapshot.data() as ExamSubmission), id: snapshot.id } : null;
  }

  saveAnswers(id: string, answers: Record<string, ExamAnswer>): Promise<void> {
    return updateDoc(doc(this.submissionsRef, id), { answers });
  }

  submit(id: string, answers: Record<string, ExamAnswer>): Promise<void> {
    return updateDoc(doc(this.submissionsRef, id), {
      answers,
      status: 'submitted',
      submittedAt: serverTimestamp(),
    });
  }
}

const sortByWindow = (list: Exam[]): Exam[] =>
  [...list].sort((a, b) => (b.opensAt?.toMillis() ?? 0) - (a.opensAt?.toMillis() ?? 0));
