(() => {
  'use strict'

  /* ------------------------------------------------------------ 基础工具 */
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s))
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const fmt = ms => {
    if (!ms || ms < 0) return '00:00'
    const s = Math.floor(ms / 1000)
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  }
  const fmtCount = n => n > 100000000 ? (n / 100000000).toFixed(1) + '亿' : n > 10000 ? (n / 10000).toFixed(1) + '万' : String(n || 0)

  let toastTimer = 0
  function toast(msg, ms = 2400) {
    const t = $('#toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), ms)
  }

  /* ------------------------------------------------------------ 原生桥 */
  let seq = 0
  const pending = new Map()
  window.__cb = (id, ok, payload) => {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    clearTimeout(p.timer)
    let data = null
    if (payload && payload !== 'null') {
      try { data = JSON.parse(payload) } catch (e) { data = payload }
    }
    if (ok) p.resolve(data)
    else p.reject(new Error(typeof data === 'string' ? data : (data && (data.message || data.msg)) || '请求失败'))
  }
  function call(method, params, timeout = 45000) {
    return new Promise((resolve, reject) => {
      const id = 'c' + (++seq)
      const timer = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('请求超时，请检查网络')) }
      }, timeout)
      pending.set(id, { resolve, reject, timer })
      try { Native.call(method, JSON.stringify(params || {}), id) }
      catch (e) { pending.delete(id); clearTimeout(timer); reject(e) }
    })
  }

  /* ------------------------------------------------------------ 状态 */
  const state = {
    config: { level: 'exhigh', dir: 'NeteaseMusic' },
    levels: [],
    queue: [],
    index: -1,
    playing: false,
    mode: 'loop',
    volume: 0.8,
    lyric: [],
    lyricIndex: -1,
    downloads: new Map(),
    history: [],
    account: null,
    theme: localStorage.getItem('sx_theme') || 'dark'
  }

  const TOPLISTS = [
    { id: 19723756, name: '飙升榜', desc: '此刻上升最快', color: '#5b8cff' },
    { id: 3779629, name: '新歌榜', desc: '最新上架单曲', color: '#2fc28a' },
    { id: 2884035, name: '原创榜', desc: '独立音乐人', color: '#e0a13a' },
    { id: 3778678, name: '热歌榜', desc: '大家都在听', color: '#ff6b6b' }
  ]
  const TOP_NAME = Object.fromEntries(TOPLISTS.map(t => [t.id, t]))

  /* ------------------------------------------------------------ 页面切换 */
  function showPage(name) {
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name))
    $$('.nav').forEach(b => b.classList.toggle('active', b.dataset.page === name))
    $('#content').scrollTop = 0
  }
  $$('.nav').forEach(btn => btn.addEventListener('click', () => {
    const page = btn.dataset.page
    showPage(page)
    if (page === 'downloads') renderDownloads()
    if (page === 'library') renderLibrary()
  }))

  /* ------------------------------------------------------------ 列表渲染 */
  function songRow(song, idx) {
    const fee = song.fee === 1 ? '<em class="tag hi">VIP</em>' : song.fee === 4 ? '<em class="tag">付费</em>' : ''
    const playing = state.queue[state.index] && state.queue[state.index].id === song.id
    return `<div class="song${playing ? ' playing' : ''}" data-id="${song.id}">
      <div class="idx">${String(idx + 1).padStart(2, '0')}</div>
      <div class="title"><b>${esc(song.name)} ${fee}</b><small>${esc(song.album || '')}</small></div>
      <div class="artist">${esc(song.artists || '')}</div>
      <div class="dur">${fmt(song.duration)}</div>
      <div class="ops">
        <button class="icon-btn" data-act="play" title="播放"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></button>
        <button class="icon-btn" data-act="dl" title="下载"><svg viewBox="0 0 24 24"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg></button>
      </div>
    </div>`
  }

  function renderSongList(box, songs, opts = {}) {
    if (!box) return
    if (!songs || !songs.length) {
      box.innerHTML = '<div class="empty-state">' + (opts.empty || '这里还没有内容') + '</div>'
      return
    }
    box.innerHTML = `<div class="songlist">${songs.map((s, i) => songRow(s, i)).join('')}</div>`
    box.querySelectorAll('.song').forEach(row => {
      const id = Number(row.dataset.id)
      const song = songs.find(s => s.id === id)
      row.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')
        if (act) {
          e.stopPropagation()
          if (act.dataset.act === 'dl') downloadSong(song)
          else playSong(song, songs)
          return
        }
        playSong(song, songs)
      })
      row.addEventListener('dblclick', () => playSong(song, songs))
    })
  }

  /* ------------------------------------------------------------ 播放器 */
  const audio = $('#audio')
  audio.preload = 'auto'
  audio.addEventListener('error', () => {
    const fb = audio.dataset.fallback
    if (fb) {
      audio.dataset.fallback = ''
      audio.src = fb
      audio.load()
      audio.play().catch(() => {})
      return
    }
    const code = audio.error && audio.error.code
    const map = { 1: '加载被中止', 2: '网络错误', 3: '解码失败', 4: '链接不可用（版权或防盗链）' }
    toast('音频加载失败：' + (map[code] || '未知错误'))
  })
  const iconPlay = $('#iconPlay')
  const ICON_PLAY = '<path d="M8 5l11 7-11 7z"/>'
  const ICON_PAUSE = '<rect x="7" y="5" width="3.6" height="14" rx="1"/><rect x="14" y="5" width="3.6" height="14" rx="1"/>'

  function setPlayingUI(on) {
    state.playing = on
    iconPlay.innerHTML = on ? ICON_PAUSE : ICON_PLAY
    $('#btnPlay').title = on ? '暂停' : '播放'
  }

  function setNowPlaying(song) {
    $('#npTitle').textContent = song.name || '未知歌曲'
    $('#npSub').textContent = (song.artists || '') + (song.album ? ' · ' + song.album : '')
    if (song.picUrl) $('#npCover').src = song.picUrl.replace(/^http:/, 'https:')
    document.title = (song.name || '熵析拓解') + ' - 熵析拓解'
  }

  async function playSong(song, queue) {
    if (queue) {
      state.queue = queue.slice()
      state.index = state.queue.findIndex(x => x.id === song.id)
    } else {
      const i = state.queue.findIndex(x => x.id === song.id)
      if (i >= 0) state.index = i
      else { state.queue.push(song); state.index = state.queue.length - 1 }
    }
    setNowPlaying(song)
    setPlayingUI(false)
    state.lyric = []
    state.lyricIndex = -1
    renderLyrics('加载歌词中…')
    try {
      const info = await call('url', { id: song.id, level: state.config.level || 'exhigh' }, 30000)
      if (!info || !info.url) throw new Error('没有拿到播放地址（可能受版权限制或需要登录）')
      const rawUrl = String(info.url)
      const src = rawUrl.replace(/^http:\/\//i, 'https://')
      audio.dataset.fallback = src !== rawUrl ? rawUrl : ''
      audio.src = src
      audio.load()
      audio.volume = state.volume
      audio.muted = false
      await audio.play()
      setPlayingUI(true)
      addHistory(song)
      loadLyric(song.id)
      updateRowsPlaying()
    } catch (e) {
      toast(e.message || '播放失败')
    }
  }

  function updateRowsPlaying() {
    const cur = state.queue[state.index]
    $$('.song').forEach(row => row.classList.toggle('playing', !!cur && Number(row.dataset.id) === cur.id))
  }

  function togglePlay() {
    if (!audio.src) {
      const first = state.queue[0]
      if (first) playSong(first)
      return
    }
    if (audio.paused) { audio.play().then(() => setPlayingUI(true)).catch(() => {}) }
    else { audio.pause(); setPlayingUI(false) }
  }

  function step(dir) {
    if (!state.queue.length) return
    let next
    if (state.mode === 'shuffle') {
      next = Math.floor(Math.random() * state.queue.length)
      if (state.queue.length > 1 && next === state.index) next = (next + 1) % state.queue.length
    } else {
      next = (state.index + dir + state.queue.length) % state.queue.length
    }
    state.index = next
    playSong(state.queue[next])
  }

  $('#btnPlay').addEventListener('click', togglePlay)
  $('#npDownload').addEventListener('click', () => {
    const cur = state.queue[state.index]
    if (!cur) { toast('还没有播放歌曲'); return }
    downloadSong(cur)
  })
  $('#btnPrev').addEventListener('click', () => step(-1))
  $('#btnNext').addEventListener('click', () => step(1))
  $('#btnMode').addEventListener('click', () => {
    const order = ['loop', 'order', 'single', 'shuffle']
    state.mode = order[(order.indexOf(state.mode) + 1) % order.length]
    toast({ loop: '列表循环', order: '顺序播放', single: '单曲循环', shuffle: '随机播放' }[state.mode])
  })

  audio.addEventListener('timeupdate', onTime)
  audio.addEventListener('loadedmetadata', onTime)
  audio.addEventListener('ended', () => {
    if (state.mode === 'single') { audio.currentTime = 0; audio.play() }
    else if (state.mode === 'order' && state.index >= state.queue.length - 1) setPlayingUI(false)
    else step(1)
  })
  audio.addEventListener('pause', () => setPlayingUI(false))
  audio.addEventListener('play', () => {
    setPlayingUI(true)
    console.log('[audio] play url=' + String(audio.currentSrc || audio.src).slice(0, 90) + ' vol=' + audio.volume + ' muted=' + audio.muted)
  })
  audio.addEventListener('volumechange', () => {
    console.log('[audio] volume=' + audio.volume + ' muted=' + audio.muted)
    const st = $('#audioState')
    if (st) st.textContent = '音量 ' + Math.round(audio.volume * 100) + '%' + (audio.muted ? '（已静音）' : '') + ' · 当前输出：系统默认'
  })

  function onTime() {
    const d = audio.duration || 0
    const t = audio.currentTime || 0
    const p = d ? (t / d) * 100 : 0
    $('#progressFill').style.width = p + '%'
    $('#progressDot').style.left = p + '%'
    $('#curTime').textContent = fmt(t * 1000)
    $('#durTime').textContent = fmt(d * 1000)
    updateLyric(t * 1000)
  }

  let dragging = false
  $('#progress').addEventListener('mousedown', e => {
    dragging = true
    seekTo(e)
    const move = ev => dragging && seekTo(ev)
    const up = () => { dragging = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  })
  function seekTo(e) {
    const box = $('#progress').getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    if (audio.duration) audio.currentTime = audio.duration * ratio
  }

  $('#volume').value = Math.round(state.volume * 100)
  $('#volume').addEventListener('input', e => {
    state.volume = Number(e.target.value) / 100
    audio.volume = state.volume
    localStorage.setItem('sx_volume', String(state.volume))
  })
  $('#btnMute').addEventListener('click', () => {
    audio.muted = !audio.muted
    $('#btnMute').style.opacity = audio.muted ? '.45' : ''
  })

  /* ------------------------------------------------------------ 歌词 */
  function parseLyrics(lrc, tlyric) {
    const tr = new Map()
    const re = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\](.*)$/
    const key = (m) => {
      let frac = m[3] || ''
      if (frac.length > 3) frac = frac.slice(0, 3)
      while (frac.length < 3) frac += '0'
      return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(frac || 0)
    }
    String(tlyric || '').split('\n').forEach(line => {
      const m = line.trim().match(re)
      if (!m) return
      const text = m[4].trim()
      if (text) tr.set(key(m), text)
    })
    const out = []
    String(lrc || '').split('\n').forEach(line => {
      const m = line.trim().match(re)
      if (!m) return
      const text = m[4].trim()
      if (!text) return
      out.push({ t: key(m), text, tr: tr.get(key(m)) || '' })
    })
    out.sort((a, b) => a.t - b.t)
    return out
  }

  async function loadLyric(id) {
    try {
      const ly = await call('lyric', { id }, 20000)
      const lines = parseLyrics(ly.lyric, ly.tlyric)
      state.lyric = lines
      if (!lines.length) { renderLyrics('暂无歌词'); return }
      renderLyrics()
    } catch (e) {
      renderLyrics('歌词加载失败')
    }
  }

  function renderLyrics(emptyText) {
    const box = $('#lyBody')
    if (emptyText) { box.innerHTML = `<div class="empty">${esc(emptyText)}</div>`; return }
    box.innerHTML = state.lyric.map((l, i) =>
      `<div class="ly-line" data-i="${i}">${esc(l.text)}${l.tr ? `<span class="tr">${esc(l.tr)}</span>` : ''}</div>`
    ).join('')
    box.querySelectorAll('.ly-line').forEach(el => {
      el.addEventListener('click', () => {
        const l = state.lyric[Number(el.dataset.i)]
        if (l && audio.duration) audio.currentTime = l.t / 1000
      })
    })
    state.lyricIndex = -1
  }

  function updateLyric(ms) {
    if (!state.lyric.length) return
    let idx = -1
    for (let i = 0; i < state.lyric.length; i++) {
      if (state.lyric[i].t <= ms + 120) idx = i
      else break
    }
    if (idx === state.lyricIndex) return
    state.lyricIndex = idx
    const box = $('#lyBody')
    $$('.ly-line', box).forEach((el, i) => el.classList.toggle('on', i === idx))
    if (idx >= 0 && $('#lyricsPanel').classList.contains('open')) {
      const el = box.querySelector(`.ly-line[data-i="${idx}"]`)
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    const cur = state.lyric[idx]
    if (cur) $('#npSub').textContent = cur.text
  }

  $('#btnLyrics').addEventListener('click', () => {
    $('#lyricsPanel').classList.toggle('open')
  })
  $('#lyClose').addEventListener('click', () => $('#lyricsPanel').classList.remove('open'))

  /* ------------------------------------------------------------ 发现页 */
  function renderToplists() {
    const grid = $('#topGrid')
    grid.innerHTML = TOPLISTS.map(t => `
      <div class="top-card" data-id="${t.id}">
        <div class="head">
          <div class="ic" style="color:${t.color}"><svg viewBox="0 0 24 24"><path d="M4 18V9"/><path d="M9 18V5"/><path d="M14 18v-6"/><path d="M19 18V8"/></svg></div>
          <div class="nm">${t.name}<span class="ds">${t.desc}</span></div>
        </div>
        <div class="top3" id="top3-${t.id}"><div class="ti"><span class="no">·</span><span class="tn">加载中…</span></div></div>
      </div>`).join('')
    grid.querySelectorAll('.top-card').forEach(card => {
      card.addEventListener('click', () => openDetail('toplist', Number(card.dataset.id)))
    })
    TOPLISTS.forEach(t => loadTop3(t.id))
  }

  async function loadTop3(id) {
    const box = $('#top3-' + id)
    if (!box) return
    try {
      const list = await call('toplist', { id, limit: 3 }, 20000)
      if (!Array.isArray(list) || !list.length) { box.innerHTML = '<div class="ti"><span class="tn">暂无数据</span></div>'; return }
      box.innerHTML = list.slice(0, 3).map((s, i) =>
        `<div class="ti"><span class="no">${i + 1}</span><span class="tn">${esc(s.name)}</span><span class="ta">${esc(s.artists || '')}</span></div>`
      ).join('')
    } catch (e) {
      box.innerHTML = '<div class="ti"><span class="tn">加载失败</span></div>'
    }
  }

  /* ------------------------------------------------------------ 详情页 */
  let detailData = null
  async function openDetail(kind, id, extra) {
    showPage('detail')
    $('#detailHead').innerHTML = '<div class="empty-state">加载中…</div>'
    $('#detailSongs').innerHTML = ''
    try {
      let songs = [], head = null
      if (kind === 'toplist') {
        songs = await call('toplist', { id, limit: 100 }, 30000)
        const t = TOP_NAME[id] || { name: extra || '榜单', desc: '' }
        head = { kicker: '排行榜', name: t.name, sub: t.desc || '', cover: null, count: songs.length }
      } else if (kind === 'playlist') {
        const p = await call('playlist', { id }, 30000)
        songs = p.tracks || []
        head = { kicker: '歌单', name: p.name, sub: (p.creator || '') + ' · ' + fmtCount(p.playCount) + ' 次播放', cover: p.coverImgUrl, count: songs.length, desc: p.description }
      } else if (kind === 'album') {
        const a = await call('album', { id }, 30000)
        songs = a.tracks || []
        head = { kicker: '专辑', name: a.name, sub: a.artist || '', cover: a.coverImgUrl, count: songs.length, desc: a.description }
      } else if (kind === 'song') {
        const s = await call('song', { id }, 20000)
        songs = [s]
        head = { kicker: '单曲', name: s.name, sub: s.artists, cover: s.picUrl, count: 1 }
      }
      detailData = { kind, id, songs, head }
      renderDetail()
    } catch (e) {
      $('#detailHead').innerHTML = `<div class="empty-state">加载失败：${esc(e.message)}</div>`
    }
  }

  function renderDetail() {
    const { songs, head } = detailData
    const cover = head.cover ? head.cover.replace(/^http:/, 'https:') : 'app_icon.png'
    $('#detailHead').innerHTML = `
      <div class="detail-head">
        <img class="detail-cover" src="${esc(cover)}" alt="">
        <div class="detail-meta">
          <div class="kicker">${esc(head.kicker)}</div>
          <h2>${esc(head.name)}</h2>
          <div class="sub">${esc(head.sub || '')} · ${head.count} 首</div>
          ${head.desc ? `<div class="sub" style="max-height:38px;overflow:hidden">${esc(head.desc)}</div>` : ''}
          <div class="detail-actions">
            <button class="btn primary" id="btnPlayAll">播放全部</button>
            <button class="btn" id="btnDlAll">下载全部</button>
          </div>
        </div>
      </div>`
    renderSongList($('#detailSongs'), songs, { empty: '这个列表还没有歌曲（可能需要在设置里登录后重试）' })
    $('#btnPlayAll').addEventListener('click', () => { if (songs.length) playSong(songs[0], songs) })
    $('#btnDlAll').addEventListener('click', () => {
      songs.slice(0, 20).forEach(s => downloadSong(s))
      toast('已加入下载队列（前 20 首）')
    })
  }

  /* ------------------------------------------------------------ 搜索 */
  async function doSearch(kw) {
    kw = String(kw || '').trim()
    if (!kw) return
    showPage('search')
    $('#searchHint').textContent = `“${kw}” 的搜索结果`
    $('#searchResults').innerHTML = '<div class="empty-state">搜索中…</div>'
    try {
      const songs = await call('search', { kw, limit: 60 }, 30000)
      if (!songs || !songs.length) { $('#searchResults').innerHTML = '<div class="empty-state">没有找到相关歌曲</div>'; return }
      renderSongList($('#searchResults'), songs)
    } catch (e) {
      $('#searchResults').innerHTML = `<div class="empty-state">搜索失败：${esc(e.message)}</div>`
    }
  }
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(e.target.value); e.target.blur() }
  })

  /* ------------------------------------------------------------ 下载 */
  function renderDownloads() {
    const box = $('#downloadList')
    const items = Array.from(state.downloads.values())
    if (!items.length) { box.innerHTML = '<div class="empty-state">还没有下载任务</div>'; return }
    box.innerHTML = items.map(d => {
      const pct = d.state === 3 ? 100 : (d.percent || 0)
      const label = d.state === 3 ? '已完成' : d.state === 4 ? '失败' : d.state === 5 ? '已取消' : (d.message || '下载中') + ' ' + pct + '%'
      return `<div class="dl-item">
        <div class="name"><b>${esc(d.name || '未知歌曲')}</b><small>${esc(d.artist || '')} ${d.path ? '· ' + esc(d.path) : ''}</small></div>
        <div class="dl-bar"><i style="width:${pct}%"></i></div>
        <div class="dl-state">${esc(label)}</div>
      </div>`
    }).join('')
    updateBadge()
  }

  function updateBadge() {
    const active = Array.from(state.downloads.values()).filter(d => d.state === 1 || d.state === 2).length
    const b = $('#dlBadge')
    b.hidden = active === 0
    b.textContent = active
  }

  window.__dl = function (jsonStr) {
    let d
    try { d = JSON.parse(jsonStr) } catch (e) { return }
    const cur = state.downloads.get(d.taskId) || { taskId: d.taskId }
    cur.state = d.state
    cur.percent = d.percent || 0
    cur.message = d.message || ''
    cur.name = d.name || cur.name
    cur.artist = cur.artist || ''
    cur.path = d.path || cur.path
    state.downloads.set(d.taskId, cur)
    updateBadge()
    if ($('#page-downloads').classList.contains('active')) renderDownloads()
    if (d.state === 3) toast('下载完成：' + (cur.name || ''))
    if (d.state === 4) toast('下载失败：' + (d.message || ''))
  }

  async function downloadSong(song) {
    if (!song) return
    try {
      const r = await call('download', { id: song.id, level: state.config.level, name: song.name, artist: song.artists }, 15000)
      if (!r || !r.taskId) throw new Error('无法开始下载')
      state.downloads.set(r.taskId, { taskId: r.taskId, name: song.name, artist: song.artists, state: 1, percent: 0, message: '准备中…' })
      updateBadge()
      toast('已加入下载队列：' + song.name)
      if ($('#page-downloads').classList.contains('active')) renderDownloads()
    } catch (e) {
      toast(e.message || '下载失败')
    }
  }

  /* ------------------------------------------------------------ 最近播放 */
  function loadHistory() {
    try { state.history = JSON.parse(localStorage.getItem('sx_history') || '[]') } catch (e) { state.history = [] }
  }
  function addHistory(song) {
    state.history = state.history.filter(x => x.id !== song.id)
    state.history.unshift({ id: song.id, name: song.name, artists: song.artists, album: song.album, picUrl: song.picUrl, duration: song.duration })
    state.history = state.history.slice(0, 60)
    try { localStorage.setItem('sx_history', JSON.stringify(state.history)) } catch (e) {}
  }
  function renderLibrary() {
    renderAccountCard()
    const box = $('#historyList')
    if (!state.history.length) { box.innerHTML = '<div class="empty-state">还没有播放记录</div>'; return }
    renderSongList(box, state.history)
  }
  $('#clearHistory').addEventListener('click', () => {
    state.history = []
    localStorage.removeItem('sx_history')
    renderLibrary()
  })

  /* ------------------------------------------------------------ 账号 */
  function renderAccountCard() {
    const a = state.account
    const name = a && a.nickname ? a.nickname : (state.config.musicU ? '已登录' : '未登录')
    const sub = a ? (a.vipName || '') + (a.maxLevelName ? ' · 最高 ' + a.maxLevelName : '') : (state.config.musicU ? 'Cookie 可能已过期，建议重新扫码' : '扫码登录后可使用完整曲库')
    $('#accName').textContent = name
    $('#accSub').textContent = sub
    $('#avatar').textContent = (name || '?').slice(0, 1)
    const box = $('#accountCard')
    if (box) {
      box.innerHTML = `<h3>${esc(name)}</h3>
        <p class="muted">${esc(sub)}</p>
        <div class="row">
          <button class="btn primary" id="cardLogin">${state.config.musicU ? '重新登录' : '扫码登录'}</button>
          <button class="btn" id="cardTest">刷新状态</button>
        </div>`
      const l = $('#cardLogin'), t = $('#cardTest')
      if (l) l.onclick = openLogin
      if (t) t.onclick = () => checkAccount(true)
      $('#settingAccount').textContent = name + (sub ? ' · ' + sub : '')
    }
    if ($('#settingAccount')) $('#settingAccount').textContent = name + (sub ? ' · ' + sub : '')
  }

  async function checkAccount(verbose) {
    if (!state.config.musicU) { state.account = null; renderAccountCard(); if (verbose) toast('还没有登录'); return }
    try {
      const r = await call('testCookie', {}, 30000)
      state.account = r && r.valid ? r : null
      if (verbose) toast(r && r.message ? r.message : (r && r.valid ? '登录有效' : 'Cookie 已过期'))
      renderAccountCard()
    } catch (e) {
      if (verbose) toast(e.message)
    }
  }

  /* ------------------------------------------------------------ 登录弹层 */
  const modal = $('#modal')
  const modalBox = $('#modalBox')
  let qrTimer = 0
  function closeModal() {
    modal.hidden = true
    clearInterval(qrTimer)
    qrTimer = 0
    modalBox.innerHTML = ''
  }
  modal.addEventListener('click', e => { if (e.target === modal) closeModal() })

  function openLogin() {
    modal.hidden = false
    modalBox.innerHTML = `<h3>扫码登录</h3>
      <p class="muted">用手机上的网易云音乐 App 扫描二维码。不要使用验证码登录，容易触发风控。</p>
      <div class="qr-wrap"><img id="qrImg" alt="二维码" src="app_icon.png"><div class="qr-status" id="qrStatus">正在获取二维码…</div></div>
      <div class="modal-actions"><button class="btn" id="mCookie">手动填 Cookie</button><button class="btn" id="mClose">关闭</button></div>`
    $('#mClose').onclick = closeModal
    $('#mCookie').onclick = () => { closeModal(); openCookie() }
    startQr()
  }

  async function startQr() {
    clearInterval(qrTimer)
    const st = $('#qrStatus')
    try {
      const r = await call('qrCreate', {}, 20000)
      if (!r || r.code !== 200 || !r.unikey) throw new Error((r && (r.message || r.msg)) || '获取二维码失败')
      const key = r.unikey
      if (r.img) $('#qrImg').src = r.img
      st.textContent = '等待扫码…'
      qrTimer = setInterval(async () => {
        try {
          const c = await call('qrCheck', { key }, 15000)
          let body = c.body
          if (typeof body === 'string') { try { body = JSON.parse(body) } catch (e) {} }
          const code = (c && c.code) || (body && body.code)
          if (code === 800) { st.textContent = '二维码已过期，请关闭重试'; clearInterval(qrTimer) }
          else if (code === 802) st.textContent = '已扫码，请在手机上确认'
          else if (code === 803) {
            clearInterval(qrTimer)
            const cookie = c.cookie || ''
            if (!cookie || cookie.indexOf('MUSIC_U=') < 0) { st.textContent = '登录失败：没有拿到 Cookie'; return }
            await call('setConfig', { cookie })
            state.config = await call('getConfig', {})
            st.textContent = '登录成功'
            closeModal()
            toast('登录成功')
            checkAccount(false)
          } else st.textContent = '等待扫码…'
        } catch (e) {}
      }, 2000)
    } catch (e) {
      st.textContent = '获取二维码失败：' + e.message
    }
  }

  function openCookie() {
    modal.hidden = false
    modalBox.innerHTML = `<h3>手动填写 Cookie</h3>
      <p class="muted">从浏览器打开 music.163.com 登录后复制 Cookie，至少包含 MUSIC_U。</p>
      <textarea id="cookieText" placeholder="MUSIC_U=..."></textarea>
      <div class="modal-actions"><button class="btn" id="mCancel">取消</button><button class="btn primary" id="mSave">保存并测试</button></div>`
    $('#mCancel').onclick = closeModal
    $('#mSave').onclick = async () => {
      const v = $('#cookieText').value.trim()
      if (!v) { toast('请先粘贴 Cookie'); return }
      try {
        await call('setConfig', { cookie: v })
        state.config = await call('getConfig', {})
        closeModal()
        toast('已保存，正在校验…')
        checkAccount(true)
      } catch (e) { toast(e.message) }
    }
  }

  /* ------------------------------------------------------------ 设置 */
  function fillSettings() {
    const sel = $('#selLevel')
    sel.innerHTML = state.levels.map(l => `<option value="${esc(l.key)}"${l.key === state.config.level ? ' selected' : ''}>${esc(l.name)}</option>`).join('')
    $('#inpDir').value = state.config.dir || 'NeteaseMusic'
    $$('[data-theme-set]').forEach(b => b.classList.toggle('primary', b.dataset.themeSet === state.theme))
  }

  $('#btnTestSound').addEventListener('click', testSound)
  $('#btnOpenLog').addEventListener('click', () => { if (Desk.openLog) Desk.openLog(); else toast('请到 %APPDATA%\\熵析拓解 查看 renderer.log') })

  function testSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 440
      gain.gain.value = 0.18
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 1.2)
      setTimeout(() => { try { ctx.close() } catch (e) {} }, 1600)
      toast('已播放 440Hz 测试音')
    } catch (e) { toast('测试音失败：' + e.message) }
  }

  $('#btnSaveSettings').addEventListener('click', async () => {
    try {
      await call('setConfig', { level: $('#selLevel').value, dir: $('#inpDir').value.trim() || 'NeteaseMusic' })
      state.config = await call('getConfig', {})
      toast('设置已保存')
    } catch (e) { toast(e.message) }
  })
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeSet)))
  $$('#btnLogin, #btnTest').forEach(b => b.addEventListener('click', () => b.id === 'btnLogin' ? openLogin() : checkAccount(true)))
  $('#btnCookie').addEventListener('click', openCookie)
  $('#accountChip').addEventListener('click', () => { showPage('library'); renderLibrary() })

  /* ------------------------------------------------------------ 主题 */
  function setTheme(t) {
    state.theme = t === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = state.theme
    localStorage.setItem('sx_theme', state.theme)
    fillSettings()
  }
  $('#btnTheme').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'))

  /* ------------------------------------------------------------ 窗口按钮 */
  const Desk = window.Desktop || {}
  if (Desk.min) {
    $('#btnMin').onclick = () => Desk.min()
    $('#btnMax').onclick = () => Desk.max()
    $('#btnClose').onclick = () => Desk.close()
    const dirBtn = $('#btnOpenMusicDir')
    if (dirBtn) dirBtn.onclick = () => Desk.openMusicDir && Desk.openMusicDir(state.config.dir || 'NeteaseMusic')
  }

  /* ------------------------------------------------------------ 其它入口 */
  $('#heroPlay').addEventListener('click', () => openDetail('toplist', 3778678))
  $('#heroImport').addEventListener('click', openParse)
  $('#btnParseLink').addEventListener('click', openParse)

  function openParse() {
    modal.hidden = false
    modalBox.innerHTML = `<h3>打开分享链接</h3>
      <p class="muted">粘贴网易云歌曲 / 歌单 / 专辑链接，或直接粘贴歌名。</p>
      <input id="linkInput" class="input" placeholder="https://music.163.com/song?id=... 或 歌名">
      <div class="modal-actions"><button class="btn" id="pCancel">取消</button><button class="btn primary" id="pOpen">打开</button></div>`
    $('#pCancel').onclick = closeModal
    $('#pOpen').onclick = async () => {
      const text = $('#linkInput').value.trim()
      if (!text) return
      closeModal()
      try {
        const r = await call('parse', { text }, 15000)
        if (r && r.type && r.id) {
          if (r.type === 'song') openDetail('song', r.id)
          else if (r.type === 'playlist') openDetail('playlist', r.id)
          else if (r.type === 'album') openDetail('album', r.id)
          else openDetail('song', r.id)
        } else doSearch(text)
      } catch (e) {
        doSearch(text)
      }
    }
  }

  /* ------------------------------------------------------------ 快捷键 */
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase()
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select'
    if (e.key === ' ' && !typing) { e.preventDefault(); togglePlay() }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#searchInput').focus() }
    if (e.key === 'Escape') { if (!modal.hidden) closeModal(); else $('#lyricsPanel').classList.remove('open') }
  })

  /* ------------------------------------------------------------ 启动 */
  async function boot() {
    setTheme(state.theme)
    loadHistory()
    const v = Number(localStorage.getItem('sx_volume'))
    if (v > 0 && v <= 1) state.volume = v
    $('#volume').value = Math.round(state.volume * 100)
    audio.volume = state.volume
    renderToplists()
    renderDownloads()
    try {
      state.config = await call('getConfig', {}, 8000)
      state.levels = await call('levels', {}, 8000)
    } catch (e) {}
    fillSettings()
    renderAccountCard()
    checkAccount(false)
  }
  boot()
})()
