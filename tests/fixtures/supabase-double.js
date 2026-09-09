/* TEST ONLY. This is an isolated, stateful Supabase API double, not a security
 * boundary or a replacement for live Supabase. Production HTML NEVER loads it.
 * The browser harness intercepts the CDN in an isolated context and blocks ALL
 * non-localhost requests. All users, passwords, records, and uploads are fake.
 */
(function () {
  const KEY = '__pamana_hci_test_backend';
  const listeners = new Set();
  function initialState() {
    return {
      users: [{ id: '00000000-0000-4000-8000-000000000001', email: 'admin@pamana.test', password: 'AdminTesting123', display_name: 'HCI Test Administrator', role: 'admin' }],
      heritage_sites: [{ id: 1, slug: 'fort-santiago-fixture', name: 'Fort Santiago (Test Fixture)', location: 'Intramuros, Manila', historical_period: 'Spanish Colonial Period', short_description: 'An isolated heritage fixture used only by the browser tests.', historical_background: 'This record exists only in the isolated test double, not in the live heritage archive.', source_reference: 'Pamana HCI test fixture', status: 'active', main_photo: null }],
      stories: [], media: [], files: {}, session: null, nextSite: 2, nextStory: 1, nextMedia: 1,
      calls: [], failNext: {}, delayMs: 35, emailConfirmationRequired: false
    };
  }
  function read() { return JSON.parse(localStorage.getItem(KEY) || 'null') || initialState(); }
  function write(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
  if (!localStorage.getItem(KEY)) write(initialState());
  function emit(event, session) { listeners.forEach(fn => fn(event, session)); }
  function userView(user) { return user ? { id: user.id, email: user.email, user_metadata: { display_name: user.display_name } } : null; }
  function sessionFor(user, token) { return { user: userView(user), access_token: token || `test-token-${user.id}`, refresh_token: 'test-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 }; }
  function userIn(state) { return state.session ? state.users.find(u => u.id === state.session.user.id) : null; }
  async function invoke(action, operation) {
    let state = read();
    state.calls.push({ action, time: Date.now() });
    const failure = state.failNext[action];
    if (failure) delete state.failNext[action];
    const delay = state.delayMs;
    write(state);
    await new Promise(resolve => setTimeout(resolve, delay));
    if (failure) {
      if (failure.throw) throw new TypeError(failure.message || 'Failed to fetch');
      if (failure.empty) return { data: null, error: null };
      return { data: null, error: failure };
    }
    state = read();
    const result = operation(state);
    write(state);
    return result;
  }
  const auth = {
    onAuthStateChange(fn) {
      listeners.add(fn);
      queueMicrotask(() => fn('INITIAL_SESSION', read().session));
      return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } };
    },
    getUser() {
      return invoke('auth.getUser', state => ({ data: { user: userView(userIn(state)) }, error: null }));
    },
    getSession() {
      return invoke('auth.getSession', state => {
        const hash = new URLSearchParams(location.hash.slice(1));
        if (hash.get('type') === 'recovery' && hash.get('access_token') === 'valid-test-recovery-token') {
          const user = state.users.find(u => u.email === 'recovery@pamana.test') || state.users[0];
          state.session = sessionFor(user, 'valid-test-recovery-token');
          setTimeout(() => emit('PASSWORD_RECOVERY', state.session), 0);
        }
        return { data: { session: state.session }, error: null };
      });
    },
    signUp({ email, password, options }) {
      return invoke('auth.signUp', state => {
        if (state.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return { data: null, error: { code: 'user_already_exists' } };
        const user = { id: `00000000-0000-4000-8000-${String(state.users.length + 1).padStart(12, '0')}`, email, password, display_name: options.data.display_name, role: 'contributor' };
        state.users.push(user);
        if (!state.emailConfirmationRequired) state.session = sessionFor(user);
        const session = state.session;
        if (session) setTimeout(() => emit('SIGNED_IN', session), 0);
        return { data: { user: userView(user), session }, error: null };
      });
    },
    signInWithPassword({ email, password }) {
      return invoke('auth.signInWithPassword', state => {
        const user = state.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (!user) return { data: null, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
        state.session = sessionFor(user);
        setTimeout(() => emit('SIGNED_IN', state.session), 0);
        return { data: { user: userView(user), session: state.session }, error: null };
      });
    },
    signOut() {
      return invoke('auth.signOut', state => { state.session = null; setTimeout(() => emit('SIGNED_OUT', null), 0); return { error: null }; });
    },
    resetPasswordForEmail(email, options) {
      return invoke('auth.resetPasswordForEmail', state => { state.lastRecovery = { email, redirectTo: options.redirectTo }; return { data: {}, error: null }; });
    },
    updateUser({ password }) {
      return invoke('auth.updateUser', state => {
        const user = userIn(state);
        if (!user) return { data: null, error: { status: 401, code: 'session_not_found' } };
        user.password = password;
        setTimeout(() => emit('USER_UPDATED', state.session), 0);
        return { data: { user: userView(user) }, error: null };
      });
    }
  };
  function rowsFor(state, table) {
    if (table === 'profiles') return state.users.map(u => ({ id: u.id, display_name: u.display_name, role: u.role }));
    return state[table] || [];
  }
  function same(a, b) { return String(a) === String(b); }
  class Query {
    constructor(table) { this.table = table; this.operation = 'select'; this.filters = []; this.options = {}; this.one = ''; this.ordering = null; }
    select(columns, options) { this.columns = columns; this.options = options || {}; return this; }
    eq(k, v) { this.filters.push(row => same(row[k], v)); return this; }
    neq(k, v) { this.filters.push(row => !same(row[k], v)); return this; }
    is(k, v) { this.filters.push(row => row[k] == v); return this; }
    ilike(k, v) { const term = String(v).replace(/^%|%$/g, '').toLowerCase(); this.filters.push(row => String(row[k] || '').toLowerCase().includes(term)); return this; }
    in(k, values) { this.filters.push(row => values.some(v => same(row[k], v))); return this; }
    or(value) {
      const site = /heritage_site_id\.eq\.([^,]+)/.exec(value);
      const stories = /story_id\.in\.\(([^)]*)\)/.exec(value);
      this.filters.push(row => (site && same(row.heritage_site_id, site[1])) || (stories && stories[1].split(',').some(id => same(row.story_id, id))));
      return this;
    }
    order(k, options) { this.ordering = [k, !options || options.ascending !== false]; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    insert(value) { this.operation = 'insert'; this.payload = value; return this; }
    update(value) { this.operation = 'update'; this.payload = value; return this; }
    delete() { this.operation = 'delete'; return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    execute() {
      return invoke(`${this.table}.${this.operation}`, state => {
        const user = userIn(state); const admin = user && user.role === 'admin';
        let rows = rowsFor(state, this.table);
        const allowed = row => {
          if (admin) return true;
          if (this.table === 'profiles') return user && row.id === user.id;
          if (this.table === 'heritage_sites') return row.status === 'active';
          if (this.table === 'stories') return row.status === 'published' || user && row.contributor_id === user.id;
          if (this.table === 'media') return user && row.uploaded_by === user.id || state.heritage_sites.some(s => same(s.id, row.heritage_site_id) && s.status === 'active') || state.stories.some(s => same(s.id, row.story_id) && s.status === 'published');
          return false;
        };
        const forbidden = () => ({ data: null, error: { code: '42501', status: 403, message: 'row-level security' } });
        if (this.operation === 'insert') {
          const p = this.payload;
          if (this.table === 'heritage_sites' && !admin) return forbidden();
          if (this.table === 'stories' && !(user && user.role === 'contributor' && p.contributor_id === user.id && p.status === 'submitted' && p.classification === null)) return forbidden();
          if (this.table === 'media' && !user) return forbidden();
          const next = this.table === 'heritage_sites' ? 'nextSite' : this.table === 'stories' ? 'nextStory' : 'nextMedia';
          const row = { ...p, id: state[next]++, created_at: new Date().toISOString() };
          state[this.table].push(row); rows = [row];
        } else if (this.operation === 'update' || this.operation === 'delete') {
          if (!admin) return forbidden();
          rows = rows.filter(row => allowed(row) && this.filters.every(fn => fn(row)));
          if (this.operation === 'update') rows.forEach(row => Object.assign(row, this.payload));
          else state[this.table] = state[this.table].filter(row => !rows.includes(row));
        } else rows = rows.filter(row => allowed(row) && this.filters.every(fn => fn(row)));
        if (this.ordering) {
          const [key, ascending] = this.ordering;
          rows.sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (ascending ? 1 : -1));
        }
        const result = rows.map(row => ({ ...row }));
        if (this.table === 'stories') result.forEach(row => {
          row.heritage_sites = state.heritage_sites.find(site => same(site.id, row.heritage_site_id)) || null;
          row.media = state.media.filter(item => same(item.story_id, row.id) && (admin || row.status === 'published' || user && row.contributor_id === user.id));
        });
        if (this.options.head) return { data: null, count: result.length, error: null };
        return { data: this.one ? result[0] || null : result, error: null };
      });
    }
  }
  const storage = { from() { return {
    upload(path, file) { return invoke('storage.upload', state => { state.files[path] = { size: file.size, type: file.type }; return { data: { path }, error: null }; }); },
    remove(paths) { return invoke('storage.remove', state => { paths.forEach(path => delete state.files[path]); return { data: [], error: null }; }); },
    createSignedUrl(path) { return invoke('storage.createSignedUrl', () => ({ data: { signedUrl: `${location.origin}/tests/fixtures/valid-photo.png` }, error: null })); }
  }; } };
  window.supabase = { createClient() { return { auth, storage, from: table => new Query(table) }; } };
  window.HciFixture = {
    read, write, reset() { write(initialState()); },
    fail(action, error) { const state = read(); state.failNext[action] = error; write(state); },
    setRole(role) {
      const state = read();
      if (!role) state.session = null;
      else {
        let user = state.users.find(u => u.role === role);
        if (!user) { user = { id: '00000000-0000-4000-8000-000000000099', email: 'contributor@pamana.test', password: 'PamanaTest123', display_name: 'Juan Dela Cruz', role }; state.users.push(user); }
        state.session = sessionFor(user);
      }
      write(state);
    },
    calls(action) { return read().calls.filter(call => call.action === action).length; }
  };
})();
