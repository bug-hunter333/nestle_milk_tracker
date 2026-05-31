/**
 * Nestlé Smart Logistics - Push Notification System
 * Handles FCM registration, token storage, and UI interactions.
 */

import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { getDatabase, ref, set, push, onValue, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

export class NotificationSystem {
    constructor(app, userRole) {
        this.app = app;
        this.db = getDatabase(app);
        this.messaging = getMessaging(app);
        this.userRole = userRole; // 'manager', 'driver', 'admin'
        this.userId = null;
        this.token = null;
        this.notifications = [];
        this.unreadCount = 0;
        this.vapidKey = 'BF-GzD_9zV6zK8U8L4y7Q2jR-3XN_X-X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X_X'; // Replace with real VAPID key

        this.initUI();
    }

    async init(userId) {
        this.userId = userId;
        console.log(`[NotificationSystem] Initializing for user: ${userId} (${this.userRole})`);
        
        try {
            await this.requestPermission();
            this.listenForHistory();
            this.listenForForegroundMessages();
        } catch (error) {
            console.error("[NotificationSystem] Initialization failed:", error);
        }
    }

    async requestPermission() {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('[NotificationSystem] Notification permission granted.');
                await this.saveToken();
            } else {
                console.warn('[NotificationSystem] Notification permission denied.');
            }
        } catch (error) {
            console.error('[NotificationSystem] Error requesting permission:', error);
        }
    }

    async saveToken() {
        try {
            // Register service worker explicitly to ensure token generation works
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            
            this.token = await getToken(this.messaging, { 
                serviceWorkerRegistration: registration,
                vapidKey: this.vapidKey 
            });

            if (this.token) {
                console.log('[NotificationSystem] FCM Token:', this.token);
                // Store token in database
                await set(ref(this.db, `fcm_tokens/${this.userId}`), {
                    token: this.token,
                    role: this.userRole,
                    lastUpdated: serverTimestamp()
                });
            } else {
                console.warn('[NotificationSystem] No registration token available. Request permission to generate one.');
            }
        } catch (error) {
            console.error('[NotificationSystem] Error getting token:', error);
        }
    }

    listenForForegroundMessages() {
        onMessage(this.messaging, (payload) => {
            console.log('[NotificationSystem] Foreground message received:', payload);
            this.addNotificationToHistory(payload);
            this.showToast(payload.notification.title, payload.notification.body, payload.data?.type);
            this.playNotificationSound(payload.data?.priority);
        });
    }

    listenForHistory() {
        const historyRef = ref(this.db, `notifications/${this.userId}`);
        onValue(historyRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.notifications = Object.entries(data).map(([id, val]) => ({ id, ...val }))
                    .sort((a, b) => b.timestamp - a.timestamp);
                
                this.unreadCount = this.notifications.filter(n => !n.read).length;
                this.updateBadge();
                this.renderDropdown();
            }
        });
    }

    async addNotificationToHistory(payload) {
        const notificationRef = push(ref(this.db, `notifications/${this.userId}`));
        await set(notificationRef, {
            title: payload.notification.title,
            body: payload.notification.body,
            type: payload.data?.type || 'system',
            priority: payload.data?.priority || 'normal',
            data: payload.data || {},
            timestamp: serverTimestamp(),
            read: false
        });

        // Analytics track
        this.trackAnalytics('delivered', payload.data?.id || 'unknown');
    }

    async markAsRead(notificationId) {
        await update(ref(this.db, `notifications/${this.userId}/${notificationId}`), {
            read: true,
            readAt: serverTimestamp()
        });
        this.trackAnalytics('opened', notificationId);
    }

    async markAllAsRead() {
        const updates = {};
        this.notifications.forEach(n => {
            if (!n.read) {
                updates[`notifications/${this.userId}/${n.id}/read`] = true;
                updates[`notifications/${this.userId}/${n.id}/readAt`] = serverTimestamp();
            }
        });
        await update(ref(this.db), updates);
    }

    trackAnalytics(event, notificationId) {
        const analyticsRef = push(ref(this.db, `notification_analytics`));
        set(analyticsRef, {
            event: event,
            notificationId: notificationId,
            userId: this.userId,
            role: this.userRole,
            timestamp: serverTimestamp()
        });
    }

    // UI METHODS
    initUI() {
        // Inject CSS
        const style = document.createElement('style');
        style.textContent = `
            .notif-dropdown {
                position: absolute;
                top: 50px;
                right: 0;
                width: 320px;
                max-height: 450px;
                background: rgba(0, 10, 24, 0.95);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 16px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                z-index: 10000;
                display: none;
                flex-direction: column;
                overflow: hidden;
                animation: fadeInNotif 0.3s ease;
            }
            @keyframes fadeInNotif { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            .notif-dropdown.open { display: flex; }
            .notif-header { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
            .notif-list { overflow-y: auto; flex: 1; }
            .notif-item { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s; position: relative; }
            .notif-item:hover { background: rgba(255,255,255,0.05); }
            .notif-item.unread { background: rgba(96, 165, 250, 0.05); }
            .notif-item.unread::before { content: ''; position: absolute; left: 6px; top: 50%; transform: translateY(-50%); width: 4px; height: 4px; background: #60a5fa; border-radius: 50%; }
            .notif-type-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0; }
            .notif-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); }
            .notif-body { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
            .notif-time { font-size: 9px; color: rgba(255,255,255,0.3); margin-top: 4px; }
            .notif-badge { position: absolute; top: -4px; right: -4px; background: #ef4444; color: white; font-size: 9px; font-weight: 800; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 2px solid #000; }
            .notif-bell { position: relative; cursor: pointer; transition: transform 0.2s; }
            .notif-bell:hover { transform: scale(1.1); }
            
            /* Types */
            .notif-emergency { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; }
            .notif-dispatch { background: rgba(96, 165, 250, 0.15); border: 1px solid rgba(96, 165, 250, 0.3); color: #60a5fa; }
            .notif-delivery { background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); color: #4ade80; }
            .notif-warning { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; }
        `;
        document.head.appendChild(style);
    }

    updateBadge() {
        const badges = document.querySelectorAll('.notif-badge-val');
        badges.forEach(b => {
            b.textContent = this.unreadCount;
            b.style.display = this.unreadCount > 0 ? 'flex' : 'none';
        });
    }

    renderDropdown() {
        const container = document.getElementById('notifDropdownList');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-[11px] text-white/30">No notifications yet</div>`;
            return;
        }

        container.innerHTML = this.notifications.map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}" onclick="window.notifSystem.handleNotifClick('${n.id}')">
                <div class="flex items-start">
                    <div class="notif-type-icon notif-${n.type}">
                        ${this.getIcon(n.type)}
                    </div>
                    <div class="flex-1">
                        <div class="notif-title">${n.title}</div>
                        <div class="notif-body">${n.body}</div>
                        <div class="notif-time">${this.formatTime(n.timestamp)}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getIcon(type) {
        switch(type) {
            case 'emergency': return '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>';
            case 'dispatch': return '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.41m5.96 5.96a14.96 14.96 0 01-5.96 5.96m0 0a14.96 14.96 0 01-5.96-5.96m5.96 5.96V21.75M9.63 8.41a14.96 14.96 0 01-5.96 5.96m5.96-5.96l-3.93-3.93m4.35 12.87l4.35-4.35m-5.34-5.34l-4.35 4.35m1.11-1.11a6 6 0 017.38-5.84"/></svg>';
            case 'delivery': return '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
            default: return '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>';
        }
    }

    formatTime(ts) {
        if (!ts) return '';
        const date = new Date(ts);
        const now = new Date();
        const diff = (now - date) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
        return date.toLocaleDateString();
    }

    handleNotifClick(id) {
        this.markAsRead(id);
        const notif = this.notifications.find(n => n.id === id);
        if (notif && notif.data?.action_url) {
            window.location.href = notif.data.action_url;
        }
        document.getElementById('notifDropdown').classList.remove('open');
    }

    showToast(title, body, type) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMsg');
        const toastIcon = document.getElementById('toastIcon');
        
        if (toast && toastMsg) {
            toastMsg.innerHTML = `<strong>${title}</strong><br>${body}`;
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
            
            if (type === 'emergency') {
                toast.style.background = 'rgba(127, 29, 29, 0.95)';
                toast.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            } else {
                toast.style.background = 'rgba(0, 12, 28, 0.96)';
                toast.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            }

            setTimeout(() => {
                toast.style.transform = 'translateX(-50%) translateY(80px)';
                toast.style.opacity = '0';
            }, 5000);
        }
    }

    playNotificationSound(priority) {
        try {
            const audio = new Audio(priority === 'high' ? '/emergency_alert.mp3' : '/notification.mp3');
            audio.play();
        } catch (e) {
            // Ignore if sound files missing or blocked by browser
        }
        
        if (priority === 'high' && window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200, 100, 500]);
        }
    }
}
