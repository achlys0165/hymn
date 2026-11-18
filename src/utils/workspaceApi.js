import { shallowRef } from 'vue';
import { readSetting, writeSetting } from './workspace.js';
import { writeLineup } from './pasteSetlistSave.js';

const base = import.meta.env.VITE_API_URL || '/api';
const cachePrefix = 'hymn:library:';
const identityKey = 'hymn_verified_user';
const offlineIdentityKey = 'hymn:offline-owner';
export const workspaceUser = shallowRef(null);
export const offlineSession = shallowRef(false);

export async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(base + path, {
    method, signal, credentials: 'include',
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function tabIdentity() {
  try {
    return JSON.parse(sessionStorage.getItem(identityKey) || 'null');
  } catch {
    return null;
  }
}

export function readLibraryCache(id) {
  return id == null ? null : readSetting(cachePrefix + id, null);
}

export function saveLibraryCache(id, snapshot) {
  if (id == null || !writeSetting(cachePrefix + id, snapshot)) return false;
  if (workspaceUser.value?.id === id) writeSetting(offlineIdentityKey, workspaceUser.value);
  return true;
}

export function clearLibraryCache(id) {
  if (id != null) writeSetting(cachePrefix + id, null);
  if (readSetting(offlineIdentityKey,null)?.id === id) writeSetting(offlineIdentityKey,null);
}

export function clearSession() {
  const id = workspaceUser.value?.id ?? tabIdentity()?.id ?? readSetting(offlineIdentityKey,null)?.id;
  clearLibraryCache(id);
  workspaceUser.value = null;
  offlineSession.value = false;
  try {
    sessionStorage.removeItem(identityKey);
    sessionStorage.removeItem('hymn_user');
  } catch { /* Browser storage can be disabled. */ }
}

export async function checkSession({ offline = false } = {}) {
  try {
    const { user } = await request('/auth/me');
    const cached = readSetting(offlineIdentityKey,null);
    if (cached && cached.id !== user?.id) clearLibraryCache(cached.id);
    workspaceUser.value = user ?? null;
    offlineSession.value = false;
    if (user) {
      try { sessionStorage.setItem(identityKey, JSON.stringify(user)); } catch { /* Storage is optional. */ }
    }
    return workspaceUser.value;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      clearSession();
      return null;
    }
    const user = offline && (!error.status || error.status >= 500)
      && (tabIdentity() ?? readSetting(offlineIdentityKey,null));
    if (user && readLibraryCache(user.id)) {
      workspaceUser.value = user;
      offlineSession.value = true;
      return user;
    }
    return null;
  }
}

export async function updateLineup(id, current, desired) {
  return writeLineup(request,id,current,desired);
}
