// Helpers that seed and inspect the Auth and Firestore emulators through their REST APIs.
// `Bearer owner` is the emulators' admin token: it bypasses the security rules.
const projectId = 'demo-indab';
const authUrl = 'http://127.0.0.1:9099';
const firestoreUrl = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner' };

export const PASSWORD = 'secreto123';

async function request(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = `${response.status} ${await response.text()}`;
    throw new Error(`${init.method ?? 'GET'} ${url} failed: ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

/** Deletes every account and document, so each test starts from an empty project. */
export async function resetEmulators(): Promise<void> {
  await request(`${authUrl}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  await request(
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}

type Value = string | boolean | number | Date | null | Value[] | { [key: string]: Value };

const toField = (value: Value): object => {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toField) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toField(v)])),
      },
    };
  }
  return { stringValue: value };
};

const fromField = (field: any): unknown => {
  if ('arrayValue' in field) return (field.arrayValue.values ?? []).map(fromField);
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('nullValue' in field) return null;
  if ('mapValue' in field) {
    return Object.fromEntries(
      Object.entries(field.mapValue.fields ?? {}).map(([k, v]) => [k, fromField(v)]),
    );
  }
  return field.stringValue ?? field.timestampValue;
};

export async function setDocument(path: string, data: Record<string, Value>): Promise<void> {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toField(v)]));
  await request(`${firestoreUrl}/${path}`, {
    method: 'PATCH',
    headers: { ...owner, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

export async function getDocument(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${firestoreUrl}/${path}`, { headers: owner });
  if (response.status === 404) return null;
  const { fields = {} } = await response.json();
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromField(v)]));
}

/** Lists a collection's documents, each with its `id`. */
export async function listDocuments(path: string): Promise<Record<string, unknown>[]> {
  const { documents = [] } = await request(`${firestoreUrl}/${path}`, { headers: owner });
  return documents.map((d: { name: string; fields?: Record<string, unknown> }) => ({
    id: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromField(v)])),
  }));
}

/** Finds the uid of the account registered with this email. */
export async function uidOf(email: string): Promise<string> {
  const { users = [] } = await request(
    `${authUrl}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { ...owner, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    },
  );
  if (!users[0]) throw new Error(`No account for ${email}`);
  return users[0].localId;
}

/**
 * Creates an account with its profile, as the app would after registration and once the email
 * is confirmed. `verified: false` leaves the email unconfirmed; `birthDate: null` leaves it out
 * (as for older and Google accounts).
 */
export async function createUser(
  displayName: string,
  email: string,
  options: {
    role?: 'student' | 'trainer' | 'admin';
    academy?: boolean;
    verified?: boolean;
    birthDate?: string | null;
  } = {},
): Promise<string> {
  const { localId: uid } = await request(
    `${authUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, displayName }),
    },
  );
  if (options.verified !== false) {
    await request(
      `${authUrl}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
      {
        method: 'POST',
        headers: { ...owner, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: uid, emailVerified: true }),
      },
    );
  }
  const birthDate = options.birthDate === undefined ? '1990-05-15' : options.birthDate;
  await setDocument(`users/${uid}`, {
    uid,
    email,
    displayName,
    role: options.role ?? 'student',
    createdAt: new Date(),
    ...(birthDate ? { birthDate } : {}),
  });
  if (options.academy !== undefined) {
    await setDocument(`enrollments/${uid}`, {
      academy: options.academy,
      courses: [],
      updatedAt: new Date(),
    });
  }
  return uid;
}

/** Opens the email confirmation link the Auth emulator "sent" to this address. */
export async function confirmEmail(email: string): Promise<void> {
  const { oobCodes = [] } = await request(`${authUrl}/emulator/v1/projects/${projectId}/oobCodes`);
  const code = oobCodes
    .filter((c: { email: string; requestType: string }) => c.email === email)
    .findLast((c: { requestType: string }) => c.requestType === 'VERIFY_EMAIL');
  if (!code) throw new Error(`No confirmation email for ${email}`);
  const response = await fetch(code.oobLink);
  if (!response.ok) throw new Error(`Confirming ${email} failed: ${response.status}`);
}
