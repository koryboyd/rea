const LOCAL_JOBS = "scaffold-planner.jobs";
const LOCAL_SETTINGS = "scaffold-planner.settings";

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function localStore() {
  let jobs = readLocal(LOCAL_JOBS, {});
  let onJobs = () => {};
  return {
    mode: "device",
    watchJobs(cb) {
      onJobs = cb;
      cb(Object.values(jobs));
    },
    async saveJob(job) {
      jobs = {
        ...jobs,
        [job.id]: { job, updatedAt: new Date().toISOString() },
      };
      writeLocal(LOCAL_JOBS, jobs);
      onJobs(Object.values(jobs));
    },
    async deleteJob(id) {
      const { [id]: _removed, ...rest } = jobs;
      jobs = rest;
      writeLocal(LOCAL_JOBS, jobs);
      onJobs(Object.values(jobs));
    },
    async loadSettings() {
      return readLocal(LOCAL_SETTINGS, null);
    },
    async saveSettings(settings) {
      writeLocal(LOCAL_SETTINGS, settings);
    },
  };
}

function cloudStore(db) {
  const jobs = db.collection("jobs");
  const settings = db.doc("settings/catalog");
  return {
    mode: "cloud",
    watchJobs(cb, onError) {
      return jobs.onSnapshot(
        (snap) => cb(snap.docs.map((d) => d.data())),
        (e) => onError?.(e),
      );
    },
    saveJob: (job) =>
      jobs
        .doc(job.id)
        .set({ job, name: job.name, updatedAt: new Date().toISOString() }),
    deleteJob: (id) => jobs.doc(id).delete(),
    async loadSettings() {
      const snap = await settings.get();
      return snap.exists ? snap.data() : null;
    },
    saveSettings: (value) => settings.set(value),
  };
}

export async function openStore() {
  const claude = globalThis.window?.claude;
  if (claude?.use) {
    try {
      const db = await claude.use("db");
      if (db) return cloudStore(db);
    } catch {
      return localStore();
    }
  }
  return localStore();
}
