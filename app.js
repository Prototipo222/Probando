window.addEventListener('DOMContentLoaded', () => {
  // Theme persistence and toggle (applies site-wide)
  const THEME_KEY = 'icaTheme';
  const AUTH_KEY = 'icaAuthUser';
  const AUTH_EXPIRY_KEY = 'icaAuthExpiry';
  const GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || 'TU_CLIENT_ID_DE_GOOGLE';
  const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
  const SUPABASE_URL = window.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
  let supabase = null;

  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function getAuthApiUrl(path) {
    if (!path) return path;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return path;
  }

  function applyTheme(theme){
    const useDark = theme === 'dark';
    document.body.classList.toggle('dark', useDark);
    document.body.classList.toggle('light', !useDark);
    document.documentElement.setAttribute('data-theme', useDark ? 'dark' : 'light');
    document.querySelectorAll('.theme-toggle').forEach(btn=>{ btn.textContent = useDark ? 'Modo Claro' : 'Modo Oscuro'; });
    try{ localStorage.setItem(THEME_KEY, useDark ? 'dark' : 'light'); }catch(e){}
  }

  const storedTheme = (function(){ try{ return localStorage.getItem(THEME_KEY); }catch(e){ return null; } })();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(storedTheme || (prefersDark ? 'dark' : 'light'));
  document.querySelectorAll('.theme-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
    });
  });

  // Activity toggles (menu)
  const activityToggles = document.querySelectorAll('.activity-toggle');
  activityToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const activity = toggle.dataset.activity;
      document.querySelectorAll('.activity-entry').forEach(entry => {
        const isActive = entry.querySelector('.activity-toggle').dataset.activity === activity;
        entry.classList.toggle('open', isActive);
      });
    });
  });

  const authButton = document.getElementById('authButton');
  const logoutButton = document.getElementById('logoutButton');
  const authPanel = document.getElementById('authPanel');
  const profilePanel = document.getElementById('profilePanel');
  const closeProfilePanel = document.getElementById('closeProfilePanel');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const profileForm = document.getElementById('profileForm');
  const authMessage = document.getElementById('authMessage');
  const profileMessage = document.getElementById('profileMessage');
  const loginTab = document.querySelector('[data-tab="login"]');
  const registerTab = document.querySelector('[data-tab="register"]');
  const googleButton = document.getElementById('googleLoginButton');
  const profileAvatarPreview = document.getElementById('profileAvatarPreview');
  const profileNameInput = document.getElementById('profileName');
  const profilePhotoInput = document.getElementById('profilePhoto');
  const profileCurrentPasswordInput = document.getElementById('profileCurrentPassword');
  const profileNewPasswordInput = document.getElementById('profileNewPassword');

  function setAuthMessage(text, type = 'error') {
    if (!authMessage) return;
    authMessage.textContent = text || '';
    authMessage.className = `auth-message ${type}`;
  }

  function setProfileMessage(text, type = 'error') {
    if (!profileMessage) return;
    profileMessage.textContent = text || '';
    profileMessage.className = `profile-message ${type}`;
  }

  function normalizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    return {
      id: user.id || '',
      fullName: user.fullName || user.name || '',
      email: user.email || '',
      photoUrl: user.photoUrl || '',
      provider: user.provider || 'local',
      createdAt: user.createdAt || new Date().toISOString()
    };
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const normalized = normalizeUser(parsed);
      const expiry = Number(localStorage.getItem(AUTH_EXPIRY_KEY) || 0);
      if (normalized && expiry && Date.now() > expiry) {
        clearStoredUser();
        return null;
      }
      return normalized;
    } catch (e) {
      clearStoredUser();
      return null;
    }
  }

  function saveStoredUser(user) {
    const normalized = normalizeUser(user);
    if (!normalized) return;
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(normalized));
      localStorage.setItem(AUTH_EXPIRY_KEY, String(Date.now() + 1000 * 60 * 60 * 24 * 7));
    } catch (e) {}
  }

  function clearStoredUser() {
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_EXPIRY_KEY);
    } catch (e) {}
  }

  function setPanelLoading(form, isLoading, text = '') {
    if (!form) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;
    submitButton.disabled = isLoading;
    if (isLoading) {
      submitButton.dataset.originalText = submitButton.textContent;
      submitButton.textContent = text || 'Procesando...';
    } else if (submitButton.dataset.originalText) {
      submitButton.textContent = submitButton.dataset.originalText;
    }
  }

  function updateAuthUI() {
    const user = getStoredUser();
    if (user && authButton) {
      authButton.innerHTML = '';
      const avatar = document.createElement('span');
      avatar.className = 'auth-avatar';
      const photo = user.photoUrl;
      if (photo) {
        const img = document.createElement('img');
        img.src = photo;
        img.alt = user.fullName || user.email;
        avatar.appendChild(img);
      } else {
        avatar.textContent = (user.fullName || user.email || 'U').charAt(0).toUpperCase();
      }
      authButton.appendChild(avatar);
      authButton.classList.add('logged-in');
      if (logoutButton) logoutButton.hidden = false;
    } else {
      authButton.innerHTML = 'Iniciar sesión';
      authButton.classList.remove('logged-in');
      if (logoutButton) logoutButton.hidden = true;
    }
  }

  function renderProfilePreview(user) {
    if (!profileAvatarPreview) return;
    profileAvatarPreview.innerHTML = '';
    const photo = user && user.photoUrl ? user.photoUrl : '';
    if (photo) {
      const img = document.createElement('img');
      img.src = photo;
      img.alt = 'Foto de perfil';
      profileAvatarPreview.appendChild(img);
    } else if (user) {
      const initials = (user.fullName || user.email || 'U').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
      profileAvatarPreview.textContent = initials || 'U';
    }
  }

  function openProfilePanel() {
    if (!profilePanel || !profileForm) return;
    const user = getStoredUser();
    if (!user) return;
    profilePanel.classList.add('open');
    profilePanel.setAttribute('aria-hidden', 'false');
    profileNameInput.value = user.fullName || '';
    profilePhotoInput.value = user.photoUrl || '';
    profileCurrentPasswordInput.value = '';
    profileNewPasswordInput.value = '';
    renderProfilePreview(user);
    setProfileMessage('');
  }

  function closeProfilePanelHandler() {
    if (!profilePanel) return;
    profilePanel.classList.remove('open');
    profilePanel.setAttribute('aria-hidden', 'true');
  }

  function openAuthPanel(tab = 'login') {
    if (!authPanel) return;
    authPanel.classList.add('open');
    authPanel.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(button => button.classList.remove('active'));
    const targetForm = tab === 'register' ? registerForm : loginForm;
    const targetTab = tab === 'register' ? registerTab : loginTab;
    if (targetForm) targetForm.classList.add('active');
    if (targetTab) targetTab.classList.add('active');
    setAuthMessage('');
    setProfileMessage('');
  }

  function closeAuthPanelHandler() {
    if (!authPanel) return;
    authPanel.classList.remove('open');
    authPanel.setAttribute('aria-hidden', 'true');
  }

  async function apiRequest(url, body, options = {}) {
    const authRoutes = ['/api/login', '/api/register', '/api/update-profile', '/api/google-login'];
    if (supabase && authRoutes.includes(url)) {
      throw new Error('La autenticación ya está siendo manejada por Supabase.');
    }
    const finalUrl = getAuthApiUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const method = options.method || 'POST';

    try {
      const fetchOptions = {
        method,
        credentials: 'same-origin',
        signal: controller.signal
      };

      if (body !== undefined && body !== null) {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(finalUrl, fetchOptions);
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : await response.text();

      if (!response.ok) {
        const errorMessage = (typeof data === 'object' && data && data.error)
          ? data.error
          : (typeof data === 'string' && data ? data : 'No se pudo completar la solicitud.');
        throw new Error(errorMessage);
      }

      return typeof data === 'string' ? { success: true, message: data } : data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('La solicitud tardó demasiado. Revisa que el servidor esté funcionando.');
      }
      if (error instanceof TypeError) {
        throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté activo.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (authButton) {
    authButton.addEventListener('click', (event) => {
      const user = getStoredUser();
      event.stopPropagation();
      if (user) {
        if (profilePanel && profilePanel.classList.contains('open')) {
          closeProfilePanelHandler();
        } else {
          openProfilePanel();
        }
      } else if (authPanel && authPanel.classList.contains('open')) {
        closeAuthPanelHandler();
      } else {
        openAuthPanel();
      }
    });
  }

  if (closeProfilePanel) {
    closeProfilePanel.addEventListener('click', closeProfilePanelHandler);
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearStoredUser();
      updateAuthUI();
      setAuthMessage('Sesión cerrada correctamente.', 'success');
      closeAuthPanelHandler();
      closeProfilePanelHandler();
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_KEY || event.key === AUTH_EXPIRY_KEY) {
      updateAuthUI();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.auth-dropdown') && authPanel) {
      closeAuthPanelHandler();
    }
    if (!event.target.closest('.profile-panel') && !event.target.closest('#authButton') && profilePanel) {
      closeProfilePanelHandler();
    }
  });

  if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => openAuthPanel('login'));
    registerTab.addEventListener('click', () => openAuthPanel('register'));
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      if (!email || !password) {
        setAuthMessage('Completa correo y contraseña.', 'error');
        return;
      }
      setPanelLoading(loginForm, true, 'Entrando...');
      try {
        if (!supabase) {
          throw new Error('Supabase no está configurado correctamente.');
        }
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error || !authData?.user) {
          throw new Error(error?.message || 'No se pudo iniciar sesión.');
        }
        const user = {
          id: authData.user.id,
          fullName: authData.user.user_metadata?.full_name || authData.user.email,
          email: authData.user.email,
          photoUrl: authData.user.user_metadata?.avatar_url || '',
          provider: authData.user.app_metadata?.provider || 'supabase'
        };
        saveStoredUser(user);
        updateAuthUI();
        closeAuthPanelHandler();
        setAuthMessage('Inicio de sesión correcto.', 'success');
      } catch (error) {
        setAuthMessage(error.message, 'error');
      } finally {
        setPanelLoading(loginForm, false);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const fullName = String(formData.get('fullName') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      if (!fullName || !email || !password) {
        setAuthMessage('Completa todos los campos para registrarte.', 'error');
        return;
      }
      if (password.length < 8 || password.length > 128) {
        setAuthMessage('La contraseña debe tener entre 8 y 128 caracteres.', 'error');
        return;
      }
      setPanelLoading(registerForm, true, 'Creando cuenta...');
      try {
        if (!supabase) {
          throw new Error('Supabase no está configurado correctamente.');
        }
        const { data: authData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });
        if (error || !authData?.user) {
          throw new Error(error?.message || 'No se pudo crear la cuenta.');
        }
        const user = {
          id: authData.user.id,
          fullName,
          email: authData.user.email,
          photoUrl: authData.user.user_metadata?.avatar_url || '',
          provider: authData.user.app_metadata?.provider || 'supabase'
        };
        saveStoredUser(user);
        updateAuthUI();
        closeAuthPanelHandler();
        setAuthMessage('Cuenta creada correctamente.', 'success');
      } catch (error) {
        setAuthMessage(error.message, 'error');
      } finally {
        setPanelLoading(registerForm, false);
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const user = getStoredUser();
      if (!user) return;
      const formData = new FormData(profileForm);
      const fullName = String(formData.get('fullName') || '').trim();
      const photoUrl = String(formData.get('photoUrl') || '').trim();
      const currentPassword = String(formData.get('currentPassword') || '');
      const newPassword = String(formData.get('newPassword') || '');

      setPanelLoading(profileForm, true, 'Guardando...');
      try {
        if (!supabase) {
          throw new Error('Supabase no está configurado correctamente.');
        }
        if (newPassword) {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) {
            throw new Error(error.message || 'No se pudo cambiar la contraseña.');
          }
        }
        const { error: profileError } = await supabase.from('users').upsert({
          id: user.id,
          fullName,
          email: user.email,
          photoUrl,
          provider: user.provider || 'supabase'
        }, { onConflict: 'id' });
        if (profileError) {
          throw new Error(profileError.message || 'No se pudo actualizar el perfil.');
        }
        const updatedUser = {
          ...user,
          fullName,
          photoUrl,
          provider: user.provider || 'supabase'
        };
        saveStoredUser(updatedUser);
        updateAuthUI();
        renderProfilePreview(updatedUser);
        setProfileMessage('Perfil actualizado correctamente.', 'success');
      } catch (error) {
        setProfileMessage(error.message, 'error');
      } finally {
        setPanelLoading(profileForm, false);
      }
    });
  }

  function decodeJwtPayload(token) {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  }

  function initializeGoogleLogin() {
    if (!googleButton) return;

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        setAuthMessage('No se pudo cargar Google Sign-In.', 'error');
        return;
      }

      if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
        googleButton.addEventListener('click', () => {
          setAuthMessage('Debes configurar un Client ID real de Google para habilitar el inicio de sesión.', 'error');
        });
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            if (!supabase) {
              throw new Error('Supabase no está configurado correctamente.');
            }
            const payload = decodeJwtPayload(response.credential);
            setPanelLoading(loginForm, true, 'Autenticando...');
            const { data: authData, error } = await supabase.auth.signInWithOAuth({
              provider: 'google'
            });
            if (error) {
              throw new Error(error.message || 'No se pudo autenticar con Google.');
            }
            if (authData?.user || payload?.email) {
              const user = {
                id: payload.sub || payload.email,
                fullName: payload.name || payload.given_name || payload.email,
                email: payload.email,
                photoUrl: payload.picture || '',
                provider: 'google'
              };
              saveStoredUser(user);
              updateAuthUI();
              closeAuthPanelHandler();
              setAuthMessage('Inicio de sesión con Google correcto.', 'success');
            }
          } catch (error) {
            setAuthMessage(error.message, 'error');
          } finally {
            setPanelLoading(loginForm, false);
          }
        }
      });

      googleButton.addEventListener('click', () => {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setAuthMessage('No se pudo abrir el popup de Google. Intenta nuevamente.', 'error');
          }
        });
      });
    };

    script.onerror = () => {
      setAuthMessage('No se pudo cargar el script de Google.', 'error');
    };

    document.head.appendChild(script);
  }

  initializeGoogleLogin();
  updateAuthUI();

  // Global music player: persist play state and playback position across pages (resume if allowed)
  try{
    const MUSIC_KEY = 'icaMusicPlaying';
    const MUSIC_TIME_KEY = 'icaMusicTime';
    const isSimulation = location.pathname && location.pathname.toLowerCase().includes('simulation');
    let audio = document.querySelector('#globalMusic');
    if (!isSimulation) {
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'globalMusic';
        audio.controls = true;
        audio.preload = 'none';
        const src = document.createElement('source');
        src.src = 'Skybound.mp3';
        src.type = 'audio/mpeg';
        audio.appendChild(src);
        const wrap = document.createElement('div');
        wrap.className = 'global-music-wrap';
        wrap.appendChild(audio);
        document.body.appendChild(wrap);
      }

      // Restore saved time if available (after metadata is loaded)
      const savedTime = (function(){ try{ return localStorage.getItem(MUSIC_TIME_KEY); }catch(e){ return null; } })();
      if (savedTime !== null) {
        const num = Number(savedTime);
        if (!Number.isNaN(num) && num >= 0) {
          if (audio.readyState >= 1) {
            try{ audio.currentTime = num; }catch(e){}
          } else {
            audio.addEventListener('loadedmetadata', function onMeta(){
              audio.removeEventListener('loadedmetadata', onMeta);
              try{ audio.currentTime = num; }catch(e){}
            });
          }
        }
      }

      // If previously playing, attempt to resume (may be blocked by autoplay policies)
      const saved = (function(){ try{ return localStorage.getItem(MUSIC_KEY); }catch(e){ return null; } })();
      if (saved === 'playing') {
        const p = audio.play();
        if (p && p.catch) p.catch(()=>{});
      }

      // Save play/pause state
      audio.addEventListener('play', ()=>{ try{ localStorage.setItem(MUSIC_KEY,'playing'); }catch(e){} });
      audio.addEventListener('pause', ()=>{ try{ localStorage.setItem(MUSIC_KEY,'paused'); }catch(e){} });

      // Persist playback position periodically (throttled via timeupdate)
      let lastSavedTime = 0;
      audio.addEventListener('timeupdate', ()=>{
        try{
          const t = Math.floor(audio.currentTime);
          if (Math.abs(t - lastSavedTime) >= 1) {
            localStorage.setItem(MUSIC_TIME_KEY, String(t));
            lastSavedTime = t;
          }
        }catch(e){}
      });

      // Also save on page unload to be safe
      window.addEventListener('beforeunload', ()=>{
        try{ localStorage.setItem(MUSIC_TIME_KEY, String(Math.floor(audio.currentTime || 0))); }catch(e){}
      });
    } else {
      // On simulation page, don't auto-play here; mark as paused so other pages won't auto-start here
      try{ localStorage.setItem('icaMusicPlaying','paused'); }catch(e){}
    }
  }catch(e){}
});
