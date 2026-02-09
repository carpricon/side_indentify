var Auth = {
  USERS_KEY: 'indentify_users',
  SESSION_KEY: 'indentify_session',

  init: function () {
    var session = this.getCurrentUser();
    this._updateUIForAuthState(session);
    this._bindEvents();
  },

  _bindEvents: function () {
    var self = this;

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;
      self.login(email, password);
    });

    document.getElementById('register-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nickname = document.getElementById('register-nickname').value.trim();
      var email = document.getElementById('register-email').value.trim();
      var password = document.getElementById('register-password').value;
      self.register(email, password, nickname);
    });

    document.getElementById('show-register').addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });

    document.getElementById('logout-btn').addEventListener('click', function () {
      self.logout();
    });
  },

  hashPassword: function (password) {
    var encoder = new TextEncoder();
    var data = encoder.encode(password);
    return crypto.subtle.digest('SHA-256', data).then(function (buffer) {
      var hashArray = Array.from(new Uint8Array(buffer));
      return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  },

  register: function (email, password, nickname) {
    var self = this;

    if (!email || !password || !nickname) {
      UI.showToast('모든 필드를 입력해주세요', 'error');
      return;
    }

    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      UI.showToast('올바른 이메일 형식을 입력해주세요', 'error');
      return;
    }

    if (password.length < 6) {
      UI.showToast('비밀번호는 6자 이상이어야 합니다', 'error');
      return;
    }

    if (nickname.length < 2) {
      UI.showToast('닉네임은 2자 이상이어야 합니다', 'error');
      return;
    }

    var users = this._getUsers();
    var exists = users.some(function (u) { return u.email === email; });
    if (exists) {
      UI.showToast('이미 가입된 이메일입니다', 'error');
      return;
    }

    this.hashPassword(password).then(function (hash) {
      var user = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        email: email,
        nickname: nickname,
        passwordHash: hash,
        createdAt: new Date().toISOString()
      };
      users.push(user);
      localStorage.setItem(self.USERS_KEY, JSON.stringify(users));

      var sessionUser = { id: user.id, email: user.email, nickname: user.nickname };
      localStorage.setItem(self.SESSION_KEY, JSON.stringify(sessionUser));

      self._updateUIForAuthState(sessionUser);
      UI.showToast(nickname + '님 환영합니다!', 'success');
      App.navigate('home');
    }).catch(function (err) {
      UI.showToast('회원가입에 실패했습니다', 'error');
    });
  },

  login: function (email, password) {
    var self = this;

    if (!email || !password) {
      UI.showToast('이메일과 비밀번호를 입력해주세요', 'error');
      return;
    }

    var users = this._getUsers();
    var user = users.find(function (u) { return u.email === email; });
    if (!user) {
      UI.showToast('이메일 또는 비밀번호가 올바르지 않습니다', 'error');
      return;
    }

    this.hashPassword(password).then(function (hash) {
      if (hash !== user.passwordHash) {
        UI.showToast('이메일 또는 비밀번호가 올바르지 않습니다', 'error');
        return;
      }

      var sessionUser = { id: user.id, email: user.email, nickname: user.nickname };
      localStorage.setItem(self.SESSION_KEY, JSON.stringify(sessionUser));

      self._updateUIForAuthState(sessionUser);
      UI.showToast(user.nickname + '님 돌아오셨군요!', 'success');
      App.navigate('home');
    }).catch(function (err) {
      UI.showToast('로그인에 실패했습니다', 'error');
    });
  },

  logout: function () {
    localStorage.removeItem(this.SESSION_KEY);
    this._updateUIForAuthState(null);
    App.navigate('home');
    UI.showToast('로그아웃 되었습니다', 'info');
  },

  getCurrentUser: function () {
    try {
      var data = localStorage.getItem(this.SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  isLoggedIn: function () {
    return this.getCurrentUser() !== null;
  },

  _getUsers: function () {
    try {
      var data = localStorage.getItem(this.USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  _updateUIForAuthState: function (user) {
    var profileNickname = document.getElementById('profile-nickname');
    var profileEmail = document.getElementById('profile-email');

    if (profileNickname && profileEmail) {
      if (user) {
        profileNickname.textContent = user.nickname;
        profileEmail.textContent = user.email;
      } else {
        profileNickname.textContent = '';
        profileEmail.textContent = '';
      }
    }
  }
};
