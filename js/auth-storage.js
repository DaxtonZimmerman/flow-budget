/* Keep auth durable across installed-app restarts. Never restore a backup without server renewal. */
(function () {
    window.createFlowAuthStorage = function () {
        let database, databaseState = 'opening', localState = 'available', recovered = false;
        function local(method, ...args) {
            try { return { ok:true, value:localStorage[method](...args) }; }
            catch (_) { localState = 'unavailable'; return { ok:false }; }
        }
        async function open() {
            if (!database) database = new Promise(resolve => {
                if (!window.indexedDB) { databaseState = 'unavailable'; resolve(null); return; }
                let request, settled = false;
                const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
                const timeout = setTimeout(() => { databaseState = 'unavailable'; finish(null); }, 2500);
                try { request = indexedDB.open('flow-auth', 1); }
                catch (_) { databaseState = 'unavailable'; finish(null); return; }
                request.onupgradeneeded = () => request.result.createObjectStore('session');
                request.onerror = () => { databaseState = 'unavailable'; finish(null); };
                request.onblocked = () => { databaseState = 'unavailable'; finish(null); };
                request.onsuccess = () => {
                    if (settled) { request.result.close(); return; }
                    databaseState = 'available';
                    request.result.onversionchange = () => { request.result.close(); database = null; };
                    finish(request.result);
                };
            });
            return database;
        }
        async function stored(method, key, value) {
            const db = await open();
            if (!db) return { ok:false };
            return new Promise(resolve => {
                let transaction, request, settled = false;
                const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
                const timeout = setTimeout(() => { databaseState = 'unavailable'; finish({ ok:false }); try { transaction?.abort(); } catch (_) {} }, 2500);
                try {
                    transaction = db.transaction('session', method === 'get' ? 'readonly' : 'readwrite');
                    const store = transaction.objectStore('session');
                    // A null tombstone prevents a deleted session being imported again.
                    request = method === 'get' ? store.get(key) : store.put(value, key);
                } catch (_) { databaseState = 'unavailable'; finish({ ok:false }); return; }
                transaction.oncomplete = () => finish({ ok:true, value:request.result });
                transaction.onabort = transaction.onerror = () => { databaseState = 'unavailable'; finish({ ok:false }); };
            });
        }
        return {
            async getItem(key) {
                const current = local('getItem', key);
                if (current.ok && current.value !== null) {
                    // Migrate existing sign-ins; wait for the durable write before opening Flow.
                    await stored('put', key, current.value);
                    return current.value;
                }
                const backup = await stored('get', key);
                if (!backup.ok || backup.value == null) return null;
                if (!current.ok) return backup.value; // IndexedDB is the primary store when localStorage is blocked.
                try {
                    const session = JSON.parse(backup.value);
                    if (key.endsWith('-auth-token') && session.access_token && session.refresh_token && session.user?.id) {
                        recovered = true;
                        // A missing local token might also mean a sign-out in an older tab.
                        // Force Supabase to validate the refresh token before granting access.
                        return JSON.stringify({ ...session, expires_at:0 });
                    }
                } catch (_) {}
                return backup.value;
            },
            async setItem(key, value) {
                const current = local('setItem', key, value);
                const backup = await stored('put', key, value);
                if (!current.ok && !backup.ok) throw new Error('Flow could not save your sign-in on this device.');
            },
            async removeItem(key) {
                const current = local('removeItem', key);
                const backup = await stored('put', key, null);
                if (!current.ok && !backup.ok) throw new Error('Flow could not clear your saved sign-in.');
            },
            status() { return { local:localState, durable:databaseState, recovered }; }
        };
    };
})();
