<template>
  <div class="app-root">

    <!-- TOP BAR -->
    <header class="topbar">
      <div class="topbar-left">
        <button class="icon-btn mobile-menu-btn" @click="sidebarOpen = !sidebarOpen" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="logo-area">
          <div class="logo-mark">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 14V7l6-5 6 5v7H2z" stroke="#1a0a1a" stroke-width="1.4" fill="none"/>
              <rect x="5.5" y="9" width="5" height="5" rx="0.5" fill="#1a0a1a"/>
            </svg>
          </div>
          <span class="logo-name">Hymn</span>
        </div>
      </div>
      <div class="topbar-right">
        <span class="topbar-label">{{ currentUser?.display_name || currentUser?.username || 'Guest' }}</span>
        <div class="avatar">{{ (currentUser?.display_name || currentUser?.username || 'G').charAt(0).toUpperCase() }}</div>
        <button class="icon-btn logout-btn" @click="logout" title="Logout" aria-label="Logout">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3v10h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 8h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- APP BODY -->
    <div class="app-body">
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

      <!-- SIDEBAR -->
      <nav class="sidebar" :class="{ 'sidebar-open': sidebarOpen }">
        <button class="icon-btn sidebar-close-btn" @click="sidebarOpen = false" aria-label="Close menu">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="nav-section-label">Manage</div>
        <div class="nav-item" :class="{ active: currentView === 'library' }" @click="navigate('library')">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h10v12H3z" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5 5h6M5 8h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
          </svg>
          Song Library
        </div>
        <div class="nav-item" :class="{ active: currentView === 'schedules' }" @click="navigate('schedules')">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5 1v3M11 1v3M2 6h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          Schedules
        </div>
        <div class="divider"></div>
        <div class="nav-section-label">Quick add</div>
        <div class="nav-item" @click="openSongModal(); sidebarOpen = false">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          New Song
        </div>
        <div class="nav-item" @click="openScheduleModal(); sidebarOpen = false">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          New Schedule
        </div>

        <div class="divider"></div>
        <div class="nav-section-label">Account</div>
        <div class="nav-item logout-nav-item" @click="logout">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3v10h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 8h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Logout
        </div>
      </nav>

      <!-- MAIN -->
      <div class="main">
        <!-- ===== LIBRARY VIEW ===== -->
        <div v-if="currentView === 'library'" class="view-container">
          <div class="panel list-panel" :class="{ 'panel-hidden-mobile': mobileDetailOpen && currentView === 'library' }">
            <div class="panel-header">
              <span class="panel-title">Song Library</span>
              <button class="btn btn-accent btn-sm" @click="openSongModal()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span class="btn-label">Add Song</span>
              </button>
            </div>
            <div class="panel-body">
              <div class="search-wrap">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M10 10l2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
                <input type="text" v-model="songSearch" placeholder="Search songs…"/>
              </div>
              <div class="song-list">
                <div
                  v-for="song in filteredSongs"
                  :key="song.id"
                  class="song-row"
                  :class="{ active: selectedSongId === song.id }"
                  @click="selectSong(song.id)"
                >
                  <div class="song-row-info">
                    <div class="song-row-title">{{ song.title }}</div>
                    <div class="song-row-meta">
                      {{ song.artist || 'Unknown artist' }}
                      <span v-if="song.key_signature" class="song-tag">{{ song.key_signature }}</span>
                      <span v-if="song.category" class="song-tag">{{ song.category }}</span>
                    </div>
                  </div>
                  <div class="song-row-actions">
                    <button class="icon-btn" @click.stop="editSong(song.id)" title="Edit">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <button class="icon-btn danger" @click.stop="deleteSong(song.id)" title="Delete">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 3.5h9M5 3.5V2h3v1.5M10 3.5l-.7 7.5H3.7L3 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div v-if="songs.length === 0" class="empty-list-msg">
                  <div class="empty-list-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M6 5h16v18H6z" stroke="currentColor" stroke-width="1.2"/>
                      <path d="M10 10h8M10 14h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <p>No songs yet</p>
                  <button class="btn btn-accent btn-sm" @click="openSongModal()">Add your first song</button>
                </div>
                <div v-else-if="filteredSongs.length === 0" class="empty-list-msg">
                  <p>No results for "{{ songSearch }}"</p>
                </div>
              </div>
            </div>
          </div>

          <div class="panel detail-panel" :class="{ 'panel-active-mobile': mobileDetailOpen && currentView === 'library' }">
            <button v-if="mobileDetailOpen" class="mobile-back-btn" @click="mobileDetailOpen = false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              All Songs
            </button>

            <div v-if="!selectedSong" class="empty-state">
              <div class="empty-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M5 4h12v14H5z" stroke="rgba(232,226,232,0.25)" stroke-width="1.3"/>
                  <path d="M8 8h6M8 11h4" stroke="rgba(232,226,232,0.25)" stroke-width="1.1" stroke-linecap="round"/>
                </svg>
              </div>
              <p>Select a song to view<br>its lyrics and details</p>
            </div>

            <div v-else class="song-detail">
              <div class="song-detail-header">
                <div class="song-detail-title-group">
                  <div class="song-detail-name">{{ selectedSong.title }}</div>
                  <div class="song-detail-artist">{{ selectedSong.artist || 'Unknown artist' }}</div>
                  <div class="song-detail-meta-row">
                    <span v-if="selectedSong.key_signature" class="meta-badge">Key: {{ selectedSong.key_signature }}</span>
                    <span v-if="selectedSong.tempo" class="meta-badge">Tempo: {{ selectedSong.tempo }}</span>
                    <span v-if="selectedSong.time_signature" class="meta-badge">Time: {{ selectedSong.time_signature }}</span>
                    <span v-if="selectedSong.category" class="meta-badge">{{ selectedSong.category }}</span>
                  </div>
                </div>
                <div class="detail-actions">
                  <button class="btn btn-subtle btn-sm" @click="editSong(selectedSongId)">Edit</button>
                  <button class="btn btn-outline btn-sm delete-btn" @click="deleteSong(selectedSongId)">Delete</button>
                </div>
              </div>
              <div class="song-detail-body">
                <div class="lyrics-label">Lyrics</div>
                <div v-if="selectedSong.lyrics" class="lyrics-text">{{ selectedSong.lyrics }}</div>
                <div v-else class="no-lyrics">No lyrics added yet.
                  <button class="inline-link" @click="editSong(selectedSongId)">Add lyrics →</button>
                </div>
              </div>
              <div class="song-detail-footer">
                <button class="btn btn-accent btn-sm" @click="addSelectedSongToSchedule()">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.1"/>
                    <path d="M6 4v4M4 6h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                  Add to Schedule
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== SCHEDULES VIEW ===== -->
        <div v-if="currentView === 'schedules'" class="view-container">
          <div class="panel list-panel" :class="{ 'panel-hidden-mobile': mobileDetailOpen && currentView === 'schedules' }">
            <div class="panel-header">
              <span class="panel-title">Schedules</span>
              <button class="btn btn-accent btn-sm" @click="openScheduleModal()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span class="btn-label">New</span>
              </button>
            </div>
            <div class="panel-body">
              <div class="schedules-list">
                <div
                  v-for="sched in schedules"
                  :key="sched.id"
                  class="schedule-card"
                  :class="{ active: selectedSchedId === sched.id }"
                  @click="selectSchedule(sched.id)"
                >
                  <div class="schedule-card-title">{{ sched.name }}</div>
                  <div class="schedule-card-meta">{{ formatDate(sched.date) }}</div>
                  <div v-if="sched.service_time" class="schedule-card-time">{{ sched.service_time }}</div>
                  <div class="schedule-songs-count">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2h6v6H2z" stroke="currentColor" stroke-width="1"/>
                    </svg>
                    {{ getScheduleSongCount(sched.id) }} song{{ getScheduleSongCount(sched.id) !== 1 ? 's' : '' }}
                    <span v-if="sched.status" :class="['status-badge', `status-${sched.status}`]">{{ sched.status }}</span>
                  </div>
                </div>
                <div v-if="schedules.length === 0" class="empty-list-msg">
                  <div class="empty-list-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <rect x="3" y="4" width="22" height="20" rx="2" stroke="currentColor" stroke-width="1.2"/>
                      <path d="M9 3v4M19 3v4M3 12h22" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <p>No schedules yet</p>
                  <button class="btn btn-accent btn-sm" @click="openScheduleModal()">Create a schedule</button>
                </div>
              </div>
            </div>
          </div>

          <div class="panel detail-panel" :class="{ 'panel-active-mobile': mobileDetailOpen && currentView === 'schedules' }">
            <button v-if="mobileDetailOpen" class="mobile-back-btn" @click="mobileDetailOpen = false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              All Schedules
            </button>

            <div v-if="!selectedSchedule" class="empty-state">
              <div class="empty-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="16" height="16" rx="2" stroke="rgba(232,226,232,0.25)" stroke-width="1.3"/>
                  <path d="M7 2v4M15 2v4M3 9h16" stroke="rgba(232,226,232,0.25)" stroke-width="1.1" stroke-linecap="round"/>
                </svg>
              </div>
              <p>Select a schedule to manage<br>its songs and order</p>
            </div>

            <div v-else class="schedule-detail">
              <div class="schedule-detail-header">
                <div>
                  <div class="schedule-detail-name">{{ selectedSchedule.name }}</div>
                  <div class="schedule-detail-date">{{ formatDate(selectedSchedule.date) }}</div>
                  <div v-if="selectedSchedule.service_time" class="schedule-detail-time">{{ selectedSchedule.service_time }}</div>
                  <div v-if="selectedSchedule.description" class="schedule-detail-desc">{{ selectedSchedule.description }}</div>
                </div>
                <div class="detail-actions">
                  <span class="badge badge-pink">
                    {{ getScheduleSongCount(selectedSchedule.id) }} song{{ getScheduleSongCount(selectedSchedule.id) !== 1 ? 's' : '' }}
                  </span>
                  <button class="btn btn-outline btn-sm delete-btn" @click="deleteSelectedSchedule()">Delete</button>
                </div>
              </div>
              <div class="panel-body sched-songs-body">
                <div class="schedule-songs">
                  <div
                    v-for="(ss, index) in selectedScheduleSongs"
                    :key="ss.id"
                    class="sched-song-item"
                  >
                    <div class="sched-song-num">{{ index + 1 }}</div>
                    <div class="sched-song-info" v-if="getSongById(ss.song_id)">
                      <div class="sched-song-title">{{ getSongById(ss.song_id).title }}</div>
                      <div class="sched-song-artist">{{ getSongById(ss.song_id).artist || 'Unknown artist' }}</div>
                      <div v-if="ss.notes" class="sched-song-notes">{{ ss.notes }}</div>
                    </div>
                    <div v-else class="sched-song-info">
                      <div class="sched-song-title" style="opacity:0.5">Song removed</div>
                    </div>
                    <div class="drag-handle" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="4" cy="3" r="1" fill="currentColor"/>
                        <circle cx="8" cy="3" r="1" fill="currentColor"/>
                        <circle cx="4" cy="6" r="1" fill="currentColor"/>
                        <circle cx="8" cy="6" r="1" fill="currentColor"/>
                        <circle cx="4" cy="9" r="1" fill="currentColor"/>
                        <circle cx="8" cy="9" r="1" fill="currentColor"/>
                      </svg>
                    </div>
                    <button class="icon-btn danger" @click="removeSongFromSchedule(ss.id)" title="Remove">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 3.5h9M5 3.5V2h3v1.5M10 3.5l-.7 7.5H3.7L3 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div v-if="selectedScheduleSongs.length === 0" class="empty-list-msg" style="padding: 32px 0;">
                  No songs added yet
                </div>
              </div>
              <div class="add-song-bar">
                <select class="add-song-select" v-model="addSongSelectValue">
                  <option value="">— Select a song to add —</option>
                  <option
                    v-for="song in availableSongsForSchedule"
                    :key="song.id"
                    :value="song.id"
                  >{{ song.title }}{{ song.artist ? ' — ' + song.artist : '' }}</option>
                </select>
                <input
                  v-model="addSongNote"
                  class="field-input add-song-note"
                  placeholder="Notes (e.g. Key of D)"
                />
                <button class="btn btn-accent btn-sm" @click="addSongToSchedule()">Add</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ===== MODALS ===== -->

    <!-- Add / Edit Song Modal -->
    <Transition name="modal">
      <div v-if="showSongModal" class="modal-overlay" @click.self="closeSongModal()">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">{{ editingSongId ? 'Edit Song' : 'Add New Song' }}</span>
            <button class="icon-btn" @click="closeSongModal()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div>
              <div class="field-label">Song Title *</div>
              <input
                class="field-input"
                :class="{ 'field-input-error': songFormError }"
                type="text"
                v-model="songForm.title"
                placeholder="e.g. Way Maker"
                ref="songTitleInput"
              />
              <div v-if="songFormError" class="field-error">Title is required</div>
            </div>
            <div>
              <div class="field-label">Artist / Songwriter</div>
              <input class="field-input" type="text" v-model="songForm.artist" placeholder="e.g. Sinach"/>
            </div>
            <div class="form-row">
              <div class="form-col">
                <div class="field-label">Key Signature</div>
                <input class="field-input" type="text" v-model="songForm.key_signature" placeholder="e.g. C, G, Ebm"/>
              </div>
              <div class="form-col">
                <div class="field-label">Tempo</div>
                <input class="field-input" type="text" v-model="songForm.tempo" placeholder="e.g. 72 BPM"/>
              </div>
              <div class="form-col">
                <div class="field-label">Time Signature</div>
                <input class="field-input" type="text" v-model="songForm.time_signature" placeholder="e.g. 4/4"/>
              </div>
            </div>
            <div>
              <div class="field-label">Category</div>
              <select class="field-input" v-model="songForm.category">
                <option value="general">General</option>
                <option value="worship">Worship</option>
                <option value="praise">Praise</option>
                <option value="hymn">Hymn</option>
                <option value="contemporary">Contemporary</option>
                <option value="gospel">Gospel</option>
              </select>
            </div>
            <div>
              <div class="field-label">Tags</div>
              <input class="field-input" type="text" v-model="songForm.tags" placeholder="e.g. fast, communion, offering"/>
            </div>
            <div>
              <div class="field-label">Lyrics</div>
              <textarea
                class="field-input"
                v-model="songForm.lyrics"
                placeholder="Paste or type lyrics here…&#10;&#10;Use blank lines to separate verses and choruses."
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="closeSongModal()">Cancel</button>
            <button class="btn btn-accent" @click="saveSong()">Save Song</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Add Schedule Modal -->
    <Transition name="modal">
      <div v-if="showScheduleModal" class="modal-overlay" @click.self="closeScheduleModal()">
        <div class="modal modal-sm">
          <div class="modal-header">
            <span class="modal-title">{{ editingScheduleId ? 'Edit Schedule' : 'New Schedule' }}</span>
            <button class="icon-btn" @click="closeScheduleModal()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div>
              <div class="field-label">Schedule Name *</div>
              <input
                class="field-input"
                :class="{ 'field-input-error': schedFormError }"
                type="text"
                v-model="schedForm.name"
                placeholder="e.g. Sunday Morning Service"
              />
              <div v-if="schedFormError" class="field-error">Name is required</div>
            </div>
            <div>
              <div class="field-label">Date *</div>
              <input class="field-input" type="date" v-model="schedForm.date"/>
            </div>
            <div>
              <div class="field-label">Service Time</div>
              <input class="field-input" type="text" v-model="schedForm.service_time" placeholder="e.g. 9:00 AM"/>
            </div>
            <div>
              <div class="field-label">Status</div>
              <select class="field-input" v-model="schedForm.status">
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="live">Live</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <div class="field-label">Description</div>
              <textarea class="field-input" v-model="schedForm.description" placeholder="Optional notes about this service…" style="min-height:60px"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="closeScheduleModal()">Cancel</button>
            <button class="btn btn-accent" @click="saveSchedule()">{{ editingScheduleId ? 'Update' : 'Create' }} Schedule</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Pick Schedule Modal -->
    <Transition name="modal">
      <div v-if="showPickScheduleModal" class="modal-overlay" @click.self="showPickScheduleModal = false">
        <div class="modal modal-sm">
          <div class="modal-header">
            <span class="modal-title">Add to Schedule</span>
            <button class="icon-btn" @click="showPickScheduleModal = false">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body pick-schedule-body">
            <div
              v-for="sched in schedules"
              :key="sched.id"
              class="schedule-card pick-card"
              @click="confirmAddToSchedule(sched.id)"
            >
              <div class="schedule-card-title">{{ sched.name }}</div>
              <div class="schedule-card-meta">{{ formatDate(sched.date) }}</div>
            </div>
            <div v-if="schedules.length === 0" class="empty-list-msg">
              No schedules available. Create one first.
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script>
/**
 * Main.vue — Hymn App Dashboard
 * Connected to Turso (libSQL) database via API service.
 *
 * REQUIRED: Create src/services/turso-api.js with your HTTP client.
 * The API client must implement the methods used below.
 */

export default {
  name: 'FlowApp',

  data() {
    return {
      currentView: 'library',

      // Data from Turso
      songs: [],
      schedules: [],
      scheduleSongs: [],

      selectedSongId: null,
      selectedSchedId: null,

      // UI
      sidebarOpen: false,
      mobileDetailOpen: false,
      songSearch: '',
      addSongSelectValue: '',
      addSongNote: '',
      isLoading: false,
      errorMessage: '',

      // Modals
      showSongModal: false,
      showScheduleModal: false,
      showPickScheduleModal: false,
      editingSongId: null,
      editingScheduleId: null,

      // Forms — match DB columns exactly
      songForm: {
        title: '',
        artist: '',
        lyrics: '',
        lyrics_format: 'auto',
        category: 'general',
        key_signature: '',
        tempo: '',
        time_signature: '',
        tags: '',
      },
      schedForm: {
        name: '',
        date: '',
        description: '',
        status: 'draft',
        service_time: '',
      },
      songFormError: false,
      schedFormError: false,

      currentUser: null,
    };
  },

  computed: {
    filteredSongs() {
      const q = this.songSearch.trim().toLowerCase();
      if (!q) return this.songs;
      return this.songs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q) ||
          (s.tags || '').toLowerCase().includes(q) ||
          (s.category || '').toLowerCase().includes(q)
      );
    },

    selectedSong() {
      return this.songs.find((s) => s.id === this.selectedSongId) ?? null;
    },

    selectedSchedule() {
      return this.schedules.find((s) => s.id === this.selectedSchedId) ?? null;
    },

    selectedScheduleSongs() {
      if (!this.selectedSchedule) return [];
      return this.scheduleSongs
        .filter((ss) => ss.schedule_id === this.selectedSchedule.id && ss.is_active === 1)
        .sort((a, b) => a.position - b.position);
    },

    availableSongsForSchedule() {
      if (!this.selectedSchedule) return [];
      const usedIds = new Set(
        this.scheduleSongs
          .filter((ss) => ss.schedule_id === this.selectedSchedule.id && ss.is_active === 1)
          .map((ss) => ss.song_id)
      );
      return this.songs.filter((s) => !usedIds.has(s.id));
    },
  },

  async mounted() {
    this.loadUser();
    await this.fetchAllData();
  },

  methods: {
    // ── Auth / User ──
    loadUser() {
      try {
        const raw = localStorage.getItem('hymn_user_data');
        if (raw) this.currentUser = JSON.parse(raw);
      } catch (e) {
        this.currentUser = null;
      }
    },

    // ── Turso API Service (injected via provide/inject or imported) ──
    // Replace these with your actual API service import:
    // import { tursoApi } from '@/services/turso-api.js';

    getApi() {
      // TODO: Replace with your actual API client import
      // Example using @libsql/client or a custom fetch wrapper:
      // return tursoApi;
      throw new Error('API client not configured. Create src/services/turso-api.js and update getApi().');
    },

    // ── Data Fetching ──
    async fetchAllData() {
      this.isLoading = true;
      this.errorMessage = '';
      try {
        const api = this.getApi();
        const [songsRes, schedulesRes, schedSongsRes] = await Promise.all([
          api.getSongs(),
          api.getSchedules(),
          api.getScheduleSongs(),
        ]);
        this.songs = songsRes;
        this.schedules = schedulesRes;
        this.scheduleSongs = schedSongsRes;
      } catch (err) {
        this.errorMessage = err.message || 'Failed to load data from database.';
        console.error(err);
      } finally {
        this.isLoading = false;
      }
    },

    // ── Navigation ──
    navigate(view) {
      this.currentView = view;
      this.mobileDetailOpen = false;
      this.sidebarOpen = false;
      if (view === 'library') {
        this.selectedSchedId = null;
      } else if (view === 'schedules') {
        this.selectedSongId = null;
      }
    },

    // ── Logout ──
    logout() {
      localStorage.removeItem('hymn_auth');
      localStorage.removeItem('hymn_user');
      localStorage.removeItem('hymn_user_data');
      this.$router.push('/login');
    },

    // ── Selection ──
    selectSong(id) {
      this.selectedSongId = id;
      this.mobileDetailOpen = true;
    },

    selectSchedule(id) {
      this.selectedSchedId = id;
      this.mobileDetailOpen = true;
    },

    getSongById(id) {
      return this.songs.find((s) => s.id === id) ?? null;
    },

    getScheduleSongCount(scheduleId) {
      return this.scheduleSongs.filter((ss) => ss.schedule_id === scheduleId && ss.is_active === 1).length;
    },

    // ── Song CRUD ──
    openSongModal() {
      this.editingSongId = null;
      this.songForm = {
        title: '',
        artist: '',
        lyrics: '',
        lyrics_format: 'auto',
        category: 'general',
        key_signature: '',
        tempo: '',
        time_signature: '',
        tags: '',
      };
      this.songFormError = false;
      this.showSongModal = true;
    },

    closeSongModal() {
      this.showSongModal = false;
      this.editingSongId = null;
      this.songFormError = false;
    },

    async saveSong() {
      if (!this.songForm.title.trim()) {
        this.songFormError = true;
        return;
      }
      this.songFormError = false;

      const userId = this.currentUser?.id || null;
      const api = this.getApi();

      try {
        if (this.editingSongId) {
          const payload = {
            title: this.songForm.title.trim(),
            artist: this.songForm.artist.trim(),
            lyrics: this.songForm.lyrics.trim(),
            lyrics_format: this.songForm.lyrics_format,
            category: this.songForm.category,
            key_signature: this.songForm.key_signature.trim(),
            tempo: this.songForm.tempo.trim(),
            time_signature: this.songForm.time_signature.trim(),
            tags: this.songForm.tags.trim(),
            updated_at: new Date().toISOString(),
          };
          await api.updateSong(this.editingSongId, payload);
          // Refresh from DB to get triggers/updated fields
          const updated = await api.getSongById(this.editingSongId);
          const idx = this.songs.findIndex((s) => s.id === this.editingSongId);
          if (idx !== -1) this.songs.splice(idx, 1, updated);
        } else {
          const payload = {
            title: this.songForm.title.trim(),
            artist: this.songForm.artist.trim(),
            lyrics: this.songForm.lyrics.trim(),
            lyrics_format: 'auto',
            category: this.songForm.category,
            key_signature: this.songForm.key_signature.trim(),
            tempo: this.songForm.tempo.trim(),
            time_signature: this.songForm.time_signature.trim(),
            tags: this.songForm.tags.trim(),
            created_by: userId,
          };
          const newSong = await api.createSong(payload);
          this.songs.push(newSong);
          this.selectedSongId = newSong.id;
          this.mobileDetailOpen = true;
        }
        this.closeSongModal();
      } catch (err) {
        this.errorMessage = err.message || 'Failed to save song.';
        console.error(err);
      }
    },

    editSong(id) {
      const song = this.songs.find((s) => s.id === id);
      if (!song) return;
      this.editingSongId = id;
      this.songForm = {
        title: song.title,
        artist: song.artist || '',
        lyrics: song.lyrics || '',
        lyrics_format: song.lyrics_format || 'auto',
        category: song.category || 'general',
        key_signature: song.key_signature || '',
        tempo: song.tempo || '',
        time_signature: song.time_signature || '',
        tags: song.tags || '',
      };
      this.songFormError = false;
      this.showSongModal = true;
    },

    async deleteSong(id) {
      if (!confirm('Delete this song? It will also be removed from all schedules.')) return;
      try {
        const api = this.getApi();
        await api.deleteSong(id);
        this.songs = this.songs.filter((s) => s.id !== id);
        // Refresh junction table since CASCADE may have fired
        this.scheduleSongs = await api.getScheduleSongs();
        if (this.selectedSongId === id) {
          this.selectedSongId = null;
          this.mobileDetailOpen = false;
        }
      } catch (err) {
        this.errorMessage = err.message || 'Failed to delete song.';
        console.error(err);
      }
    },

    // ── Schedule CRUD ──
    openScheduleModal() {
      this.editingScheduleId = null;
      this.schedForm = {
        name: '',
        date: '',
        description: '',
        status: 'draft',
        service_time: '',
      };
      this.schedFormError = false;
      this.showScheduleModal = true;
    },

    closeScheduleModal() {
      this.showScheduleModal = false;
      this.editingScheduleId = null;
      this.schedFormError = false;
    },

    async saveSchedule() {
      if (!this.schedForm.name.trim() || !this.schedForm.date) {
        this.schedFormError = true;
        return;
      }
      this.schedFormError = false;

      const userId = this.currentUser?.id || null;
      const api = this.getApi();

      try {
        if (this.editingScheduleId) {
          const payload = {
            name: this.schedForm.name.trim(),
            date: this.schedForm.date,
            description: this.schedForm.description.trim(),
            status: this.schedForm.status,
            service_time: this.schedForm.service_time.trim(),
            updated_at: new Date().toISOString(),
          };
          await api.updateSchedule(this.editingScheduleId, payload);
          const updated = await api.getScheduleById(this.editingScheduleId);
          const idx = this.schedules.findIndex((s) => s.id === this.editingScheduleId);
          if (idx !== -1) this.schedules.splice(idx, 1, updated);
          this.closeScheduleModal();
        } else {
          const payload = {
            name: this.schedForm.name.trim(),
            date: this.schedForm.date,
            description: this.schedForm.description.trim(),
            status: this.schedForm.status,
            service_time: this.schedForm.service_time.trim(),
            created_by: userId,
          };
          const newSched = await api.createSchedule(payload);
          this.schedules.push(newSched);
          this.selectedSchedId = newSched.id;
          this.closeScheduleModal();
          this.currentView = 'schedules';
          this.mobileDetailOpen = true;
        }
      } catch (err) {
        this.errorMessage = err.message || 'Failed to save schedule.';
        console.error(err);
      }
    },

    async deleteSelectedSchedule() {
      if (!this.selectedSchedId) return;
      if (!confirm('Delete this schedule?')) return;
      try {
        const api = this.getApi();
        await api.deleteSchedule(this.selectedSchedId);
        this.schedules = this.schedules.filter((s) => s.id !== this.selectedSchedId);
        this.scheduleSongs = await api.getScheduleSongs();
        this.selectedSchedId = null;
        this.mobileDetailOpen = false;
      } catch (err) {
        this.errorMessage = err.message || 'Failed to delete schedule.';
        console.error(err);
      }
    },

    // ── Add song to schedule ──
    addSelectedSongToSchedule() {
      if (!this.selectedSongId) return;
      if (this.schedules.length === 0) {
        this.openScheduleModal();
        return;
      }
      this.showPickScheduleModal = true;
    },

    async confirmAddToSchedule(schedId) {
      const sched = this.schedules.find((s) => s.id === schedId);
      if (!sched || !this.selectedSongId) return;

      const exists = this.scheduleSongs.some(
        (ss) => ss.schedule_id === schedId && ss.song_id === this.selectedSongId && ss.is_active === 1
      );
      if (exists) {
        this.showPickScheduleModal = false;
        this.selectedSchedId = schedId;
        this.currentView = 'schedules';
        this.mobileDetailOpen = true;
        return;
      }

      try {
        const api = this.getApi();
        const maxPos = this.scheduleSongs
          .filter((ss) => ss.schedule_id === schedId && ss.is_active === 1)
          .reduce((max, ss) => Math.max(max, ss.position), -1);

        const payload = {
          schedule_id: schedId,
          song_id: this.selectedSongId,
          position: maxPos + 1,
          notes: '',
          is_active: 1,
        };
        const newSS = await api.createScheduleSong(payload);
        this.scheduleSongs.push(newSS);

        this.showPickScheduleModal = false;
        this.selectedSchedId = schedId;
        this.currentView = 'schedules';
        this.mobileDetailOpen = true;
      } catch (err) {
        this.errorMessage = err.message || 'Failed to add song to schedule.';
        console.error(err);
      }
    },

    async addSongToSchedule() {
      const songId = Number(this.addSongSelectValue);
      if (!songId || !this.selectedSchedId) return;

      const exists = this.scheduleSongs.some(
        (ss) => ss.schedule_id === this.selectedSchedId && ss.song_id === songId && ss.is_active === 1
      );
      if (exists) {
        this.addSongSelectValue = '';
        this.addSongNote = '';
        return;
      }

      try {
        const api = this.getApi();
        const maxPos = this.scheduleSongs
          .filter((ss) => ss.schedule_id === this.selectedSchedId && ss.is_active === 1)
          .reduce((max, ss) => Math.max(max, ss.position), -1);

        const payload = {
          schedule_id: this.selectedSchedId,
          song_id: songId,
          position: maxPos + 1,
          notes: this.addSongNote.trim(),
          is_active: 1,
        };
        const newSS = await api.createScheduleSong(payload);
        this.scheduleSongs.push(newSS);
        this.addSongSelectValue = '';
        this.addSongNote = '';
      } catch (err) {
        this.errorMessage = err.message || 'Failed to add song to schedule.';
        console.error(err);
      }
    },

    async removeSongFromSchedule(schedSongId) {
      try {
        const api = this.getApi();
        await api.deleteScheduleSong(schedSongId);
        // Refresh to get re-indexed positions from DB trigger
        this.scheduleSongs = await api.getScheduleSongs();
      } catch (err) {
        this.errorMessage = err.message || 'Failed to remove song from schedule.';
        console.error(err);
      }
    },

    // ── Helpers ──
    formatDate(dateStr) {
      if (!dateStr) return 'No date set';
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    },
  },
};
</script>