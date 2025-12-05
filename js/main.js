// js/main.js

// グローバルスコープの変数宣言
let adScreen, mainContent, adVideo;
let fixedUrlButton; 

// デモユーザーID (展示会用の共通アカウントID)
const DEMO_USER_ID = "DEMO_USER_001"; 

// 広告画面に遷移するグローバル関数
function goToAdScreen() {
    if (window.vueApp && window.vueApp.currentUser) {
        if (!window.vueApp.isDemoMode) {
            window.vueApp.detachUserListener();
        }
    }
    if (mainContent && adScreen && adVideo) {
        fixedUrlButton.style.display = 'none'; 
        mainContent.classList.add('hidden');
        adScreen.style.display = 'block';
        if (adVideo.paused) {
            adVideo.play().catch(e => console.error("Video play failed:", e));
        }
        adVideo.volume = 1.0;
        
        if (window.vueApp && window.vueApp.activePopup) {
            window.vueApp.activePopup.close();
            window.vueApp.activePopup = null;
        }
        
        if (window.vueApp) {
            window.vueApp.isEventDetailVisible = false;
            window.vueApp.isQuestDetailVisible = false;
            window.vueApp.isRewardPageVisible = false;
        }
    }
}

// ページ読み込み完了時のイベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    adScreen = document.getElementById('ad-screen');
    mainContent = document.getElementById('main-content');
    adVideo = document.getElementById('ad-video');
    fixedUrlButton = document.getElementById('fixed-url-button'); 

    if (!adScreen || !mainContent || !adVideo) {
        console.error("必要なHTML要素が見つかりません。");
        return;
    }

    const adVideos = ['https://firebasestorage.googleapis.com/v0/b/pilgrimage-quest-app.firebasestorage.app/o/%E3%82%A6%E3%82%A3%E3%83%83%E3%83%81%E3%83%BC%E3%82%BA%E7%B8%A6%E5%8B%95%E7%94%BB.mp4?alt=media&token=a46dc108-bc30-4345-8bde-199f2214e5ad'];
    let currentVideoIndex = 0;

    adVideo.addEventListener('ended', () => {
        currentVideoIndex = (currentVideoIndex + 1) % adVideos.length;
        adVideo.src = adVideos[currentVideoIndex];
        adVideo.play();
    });
    adVideo.src = adVideos[0];

    let inactivityTimer;
    const inactivityTimeout = 90000; // 90秒

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(goToAdScreen, inactivityTimeout);
    }

    document.body.addEventListener('click', resetInactivityTimer, true);
    document.body.addEventListener('touchstart', resetInactivityTimer, true);
    document.body.addEventListener('wheel', resetInactivityTimer, { passive: true, capture: true });

    adScreen.addEventListener('click', () => {
        fixedUrlButton.style.display = 'block'; 
        adScreen.style.display = 'none';
        mainContent.classList.remove('hidden');
        resetInactivityTimer();

        setTimeout(() => {
            if (window.vueApp && window.vueApp.map) {
                window.vueApp.map.invalidateSize();
                console.log("Map size invalidated.");
            }
        }, 100); 

        let volume = 1.0;
        const fadeOut = setInterval(() => {
            if (volume > 0.1) {
                volume -= 0.1;
                adVideo.volume = volume;
            } else {
                adVideo.pause();
                clearInterval(fadeOut);
            }
        }, 50);
    });

    initMap();
});


// Firebase (本番モード) の設定
const firebaseConfig = {
    apiKey: "AIzaSyAxZffh198by405B4t64hTMyEFatYiX92A",
    authDomain: "point-tuika.firebaseapp.com",
    projectId: "point-tuika",
    storageBucket: "point-tuika.firebasestorage.app",
    messagingSenderId: "763384904606",
    appId: "1:763384904606:web:8d7556d0089b5f9f08b48f"
  };

let db; 
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore(); 
    // オフライン永続化の有効化
    db.enablePersistence().catch(err => {
        console.warn("Firebase offline persistence failed:", err.code);
    });
    console.log("Firebase (本番モード) の初期化に成功しました。");
} catch (e) {
    console.error("Firebase の初期化に失敗しました:", e);
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'images/marker-icon-2x.png',
  iconUrl: 'images/marker-icon.png',
  shadowUrl: 'images/marker-shadow.png',
  imagePath: 'images/'
});


// Vueアプリの初期化
function initMap() {
    const app = Vue.createApp({
        data() {
            return {
                map: null,
                header: null,
                spots: [],
                allQuests: [],
                markers: [], 
                activePopup: null,
                isAnimating: false,
                animationFrameId: null, 
                isHeaderExpanded: false,
                isEventDetailVisible: false,
                currentSpotForEvents: null,
                currentSpotEvents: [],
                isQrModalVisible: false,
                currentQrCode: '',
                qrModalCaption: '',
                activeVideoFades: {},
                eventObserver: null,
                isPurchaseModalVisible: false,
                isLodgingModalVisible: false,
                modalTargetSpot: null,
                selectedLodgingPlan: null,
                isAuthModalVisible: false,
                enteredAuthToken: '',
                isTokenLoading: false,
                authErrorMessage: '',
                currentUser: null,
                isQuestDetailVisible: false,
                currentQuestForDetail: null,
                userListener: null, 
                isRewardPageVisible: false, 
                rewards: [], 
                isRedeeming: false, 
                isDemoMode: false, 
            };
        },
        computed: {
        },
        mounted() {
            try {
                console.log("ステップ3: mounted() が呼び出されました。");
                
                this.map = L.map('map').setView([36.391799, 139.069795], 17);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19, 
                    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>' 
                }).addTo(this.map); 

                console.log("Leaflet地図の初期化に成功しました。");

                this.map.on('click', () => {
                    if (this.activePopup) { 
                        this.activePopup.close();
                        this.activePopup = null;
                    }
                    this.hideEventDetail();
                    this.hideQuestDetail();
                });
            
                // Popup内のボタンイベントリスナー
                document.body.addEventListener('click', (event) => {
                    if (event.target.matches('.event-btn')) { 
                        const spotName = event.target.dataset.spotName; 
                        const spotData = this.spots.find(s => s.name === spotName); 
                        if (spotData) this.showEventDetail(spotData); 
                    }
                    if (event.target.matches('.start-quest-btn')) { 
                        const questId = event.target.dataset.questId; 
                        if (questId) this.showQuestDetail(questId); 
                    }
                    if (event.target.matches('.purchase')) {
                        const spotId = event.target.dataset.spotId; 
                        if (spotId) this.showPurchaseModal(spotId);
                    }
                    if (event.target.matches('.lodging')) {
                        const spotId = event.target.dataset.spotId;
                        if (spotId) this.showLodgingModal(spotId);
                    }
                });

                if (db) {
                    console.log("本番環境を検出しました。データを自動で読み込みます。");
                    this.fetchData('production');
                } else {
                    console.warn("本番環境に接続できません。モード選択モーダルを表示します。");
                    this.showAuthModal();
                }

            } catch (error) {
                console.error("Leaflet地図の初期化中にエラー:", error);
                const mapEl = document.getElementById('map');
                if (mapEl) {
                    mapEl.innerHTML = `<h2 style="color: red; text-align: center; padding-top: 20%;">エラー: 地図の初期化に失敗しました。</h2>`;
                    mapEl.style.backgroundColor = '#333';
                }
            }
        },
        methods: {
            handleBackToAdClick() {
                goToAdScreen();
            },
            
            async fetchData(mode) {
                // モードによってデータの取得先を分岐
                if (mode === 'demo') {
                    this.isDemoMode = true;
                    // デモモード: ローカルJSONから取得
                    await this.fetchLocalData();
                } else {
                    this.isDemoMode = false;
                    // 本番モード: Firebaseから取得
                    if (!db) {
                        if (this.currentUser) { 
                            this.authErrorMessage = "本番データベースに接続できません。電波状況を確認するか、デモモードをお試しください。";
                            this.isTokenLoading = false;
                            return;
                        }
                        console.warn("DB未接続のため、本番データのフェッチをスキップします。");
                        return;
                    }
                    await this.fetchFirebaseData();
                }
            },

            async fetchLocalData() {
                console.log("JSONデータ (デモモード) の読み込みを開始します...");
                try {
                    const headerResponse = await fetch('data/header.json');
                    if (!headerResponse.ok) throw new Error('header.jsonの読み込みに失敗');
                    this.header = await headerResponse.json();
                    
                    const spotsResponse = await fetch('data/spots.json');
                    if (!spotsResponse.ok) throw new Error('spots.jsonの読み込みに失敗');
                    this.spots = await spotsResponse.json();

                    const questsResponse = await fetch('data/quests.json');
                    if (!questsResponse.ok) throw new Error('quests.jsonの読み込みに失敗');
                    this.allQuests = await questsResponse.json();
                    
                    const rewardsResponse = await fetch('data/rewards.json');
                    if (!rewardsResponse.ok) throw new Error('rewards.jsonの読み込みに失敗');
                    this.rewards = await rewardsResponse.json();
                    this.rewards.sort((a, b) => a.requiredPoints - b.requiredPoints);
                    
                    console.log("デモデータの読み込み完了");
                    this.placeMarkers();

                } catch (error) {
                    console.error("JSONデータの取得エラー: ", error);
                    alert('データ読み込みに失敗しました。dataフォルダとJSONファイルを確認してください。');
                }
            },

            // 本番モード用データ取得メソッド（復活）
            async fetchFirebaseData() {
                console.log("Firebase (本番モード) のデータ読み込みを開始します...");
                try {
                    const headerDoc = await db.collection('config').doc('header').get();
                    if (headerDoc.exists) {
                        this.header = headerDoc.data();
                    }

                    const spotsSnapshot = await db.collection('spots').get();
                    const questsSnapshot = await db.collection('quests').get();
                    const rewardsSnapshot = await db.collection('prizes').orderBy('requiredPoints', 'asc').get();

                    this.allQuests = questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    const spotsList = [];
                    spotsSnapshot.forEach((doc) => {
                        spotsList.push({ id: doc.id, ...doc.data() });
                    });
                    this.spots = spotsList;
                    
                    this.rewards = rewardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    console.log("Firebaseデータの読み込み完了");
                    this.placeMarkers();

                } catch (error) {
                    console.error("Firestoreからのデータ取得エラー: ", error);
                    alert('本番データの取得中にエラーが発生しました。電波状況を確認してください。');
                }
            },
            
            placeMarkers() { 
                console.log("Leaflet.js版 placeMarkers を実行します。");

                if (this.markers && this.markers.length > 0) {
                    this.markers.forEach(marker => {
                        marker.remove();
                    });
                }
                this.markers = [];
                
                if (!this.spots || this.spots.length === 0) {
                    return;
                }

                this.spots.forEach(spot => {
                    if (!spot.latitude || !spot.longitude) {
                        return;
                    }
                    const lat = parseFloat(spot.latitude);
                    const lng = parseFloat(spot.longitude);

                    if (isNaN(lat) || isNaN(lng)) {
                        return;
                    }
                    
                    const position = [lat, lng];
                    
                    const marker = L.marker(position, {
                        title: spot.name
                    });

                    let spotImageHtml = '';
                    const imageUrl = spot.detail_image || spot.image; 
                    
                    if (imageUrl) {
                        if (this.isVideoFile(imageUrl)) {
                            spotImageHtml = `
                                <video src="${imageUrl}" class="info-window-spot-image" 
                                       autoplay loop muted playsinline controls>
                                </video>
                            `;
                        } else {
                            spotImageHtml = `
                                <img src="${imageUrl}" alt="${spot.name}" 
                                     class="info-window-spot-image">
                            `;
                        }
                    }

                    let spotDetailsHtml = '<div class="info-window-spot-details">';
                    if (spot.comment) {
                        spotDetailsHtml += `<p>${spot.comment.replace(/\n/g, '<br>')}</p>`;
                    }
                    if (spot.address) {
                        spotDetailsHtml += `<p><strong>住所:</strong> ${spot.address}</p>`;
                    }
                    if (spot.phone) {
                        spotDetailsHtml += `<p><strong>電話:</strong> ${spot.phone}</p>`;
                    }
                    if (spot.hours) {
                        spotDetailsHtml += `<p><strong>営業時間:</strong> ${spot.hours}</p>`;
                    }
                    spotDetailsHtml += '</div>';

                    let goodsHtml = '';
                    let lodgingButtonHtml = '';
                    if (spot.goodsUrl) {
                        goodsHtml = `<button class="info-window-btn purchase" data-spot-id="${spot.id}">グッズを購入</button>`;
                    }
                    if (spot.lodgingUrl) {
                        lodgingButtonHtml = `<button class="info-window-btn lodging" data-spot-id="${spot.id}">宿泊予約</button>`;
                    }
            
                    let questButtonHtml = '';
                    if (spot.questId) {
                        let questStatus = '';
                        if (this.currentUser && this.currentUser.questProgress) {
                            questStatus = this.currentUser.questProgress[spot.questId];
                        }
                        
                        // スマホ操作を待つのみ（デモモードでもクリックによる擬似クリア機能は削除）
                        if (questStatus === 'in_progress') {
                             questButtonHtml = `<button class="info-window-btn info-btn" disabled>クエスト進行中...</button>`;
                        } else if (questStatus === 'completed') {
                             questButtonHtml = `<button class="info-window-btn info-btn-green" disabled>クエストクリア！</button>`;
                        } else {
                             questButtonHtml = `<button class="info-window-btn start-quest-btn" data-quest-id="${spot.questId}">クエストを受注する</button>`;
                        }
                    }
            
                    let eventButtonHtml = '';
                    if (spot.event1_name) {
                        eventButtonHtml = `<button class="info-window-btn event-btn" data-spot-name="${spot.name}">イベント詳細を見る</button>`;
                    }

                    if (spot.goodsUrl) {
                        goodsHtml = `<button class="info-window-btn purchase" data-spot-id="${spot.id}">グッズを購入</button>`;
                    }
                    if (spot.lodgingUrl) {
                        lodgingButtonHtml = `<button class="info-window-btn lodging" data-spot-id="${spot.id}">宿泊予約</button>`;
                    }

                    const popupContent = `
                        <div class="info-window">
                            <h6 class="info-window-header">${spot.name}</h6>
                            <div class="info-window-content">
                                ${spotImageHtml}
                                ${spotDetailsHtml}
                                ${goodsHtml}
                                ${lodgingButtonHtml}
                                ${questButtonHtml}
                                ${eventButtonHtml} 
                            </div>
                        </div>
                    `;

                    const popup = L.popup({
                        maxWidth: 450, 
                        autoPan: true, 
                        closeButton: true,
                        autoClose: false
                    }).setContent(popupContent);
                    
                    marker.bindPopup(popup);

                    marker.on('click', (e) => {
                        if (this.activePopup && this.activePopup !== e.target.getPopup()) {
                             this.activePopup.close();
                        }
                        this.activePopup = e.target.getPopup();

                        this.hideEventDetail();
                        this.hideQuestDetail();
                    });

                    marker.addTo(this.map);
                    this.markers.push(marker);
                });
            },

            onSpotClick(spotName) {
                console.log(`スポットがクリックされました: ${spotName}`);
                
                const marker = this.markers.find(m => m.options.title === spotName);
                const spot = this.spots.find(s => s.name === spotName);

                if (!spot) return;
                
                if (!spot.latitude || !spot.longitude) {
                    if(marker) {
                        marker.openPopup();
                        this.activePopup = marker.getPopup();
                    }
                    return; 
                }

                const lat = parseFloat(spot.latitude);
                const lng = parseFloat(spot.longitude);

                if (isNaN(lat) || isNaN(lng)) return;
                
                const latLng = [lat, lng];
                
                this.flyTo(latLng, 18); 
                
                if (marker) {
                    setTimeout(() => {
                        if (this.activePopup && this.activePopup !== marker.getPopup()) {
                             this.activePopup.close();
                        }
                        marker.openPopup();
                        this.activePopup = marker.getPopup();
                    }, 500); 
                }
            },

            openInfoWindow(infoWindow, marker) {
                // Leafletでは未使用
            },

            easing(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
            
            flyTo(destination, endZoom) {
                if (!this.map || !destination) return;
                const zoom = endZoom || 17;
                
                this.map.flyTo(destination, zoom, {
                    animate: true,
                    duration: 2.0 
                });
            },

            focusOnQuestSpot(questId) {
                if (!questId) return;

                const targetSpot = this.spots.find(s => s.questId === questId);
                if (!targetSpot) return;
                
                this.onSpotClick(targetSpot.name);
            },
            
            fadeVolume(refName, element, targetVolume, duration = 500) {
                if (!element) return;
                if (this.activeVideoFades[refName]) {
                    clearInterval(this.activeVideoFades[refName]);
                }
                const startVolume = element.volume;
                const interval = 20;
                const step = (targetVolume - startVolume) / (duration / interval);
                this.activeVideoFades[refName] = setInterval(() => {
                    const newVolume = element.volume + step;
                    if ((step > 0 && newVolume >= targetVolume) || (step < 0 && newVolume <= targetVolume)) {
                        element.volume = targetVolume;
                        clearInterval(this.activeVideoFades[refName]);
                        delete this.activeVideoFades[refName];
                    } else {
                        element.volume = newVolume;
                    }
                }, interval);
            },
            showEventDetail(spotData) { 
                const events = [];
                for (let i = 1; i <= 3; i++) {
                    if (spotData[`event${i}_name`]) {
                        events.push({
                            name: spotData[`event${i}_name`],
                            datetime: spotData[`event${i}_datetime`],
                            location: spotData[`event${i}_location`],
                            description: spotData[`event${i}_description`],
                            access: spotData[`event${i}_access`],
                            qrcode: spotData[`event${i}_qrcode`],
                            image: spotData[`event${i}_image`]
                        });
                    }
                }
                this.currentSpotEvents = events;
                this.currentSpotForEvents = spotData;
                this.isEventDetailVisible = true;
            },
            hideEventDetail() {
                if (this.isEventDetailVisible) {
                    this.isEventDetailVisible = false;
                }
            },
            showQrCode(qrCodeUrl, caption = 'アプリで読み込んでください') {
                this.currentQrCode = qrCodeUrl;
                this.qrModalCaption = caption;
                this.isQrModalVisible = true;
            },
            hideQrCode() {
                this.isQrModalVisible = false;
            },
            async showQuestDetail(questId) { 
                try {
                    const questData = this.allQuests.find(q => q.id === questId);

                    if (questData) {
                        this.currentQuestForDetail = {
                            id: questData.id,
                            title: questData.title,
                            image: questData.image,
                            description: questData.description,
                            clearCondition: questData.clearCondition,
                            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=QUEST_START::${questId}`
                        };
                        this.isQuestDetailVisible = true;
                    } else {
                        console.error("指定されたクエストが見つかりません:", questId);
                    }
                } catch (error) {
                    console.error("クエスト情報の取得エラー:", error);
                }
            },
            hideQuestDetail() {
                this.isQuestDetailVisible = false;
            },
            
            // --- 展示会用：リセット機能（クラウド対応） ---
            async resetExhibition() {
                if (!confirm("展示用リセットを行いますか？\n（次の体験者のためにクラウド上のデータを初期化します）")) {
                    return;
                }

                const defaultUser = {
                    userId: DEMO_USER_ID,
                    points: 5000, // デモ用の初期ポイント
                    questProgress: {}
                };
                
                this.isTokenLoading = true; 

                try {
                    // 1. Firebase (DEMO_USER) をリセット
                    if (db) {
                         await db.collection('users').doc(DEMO_USER_ID).set(defaultUser);
                         console.log("クラウド上のDEMOデータをリセットしました。");
                    }
                    
                    this.currentUser = defaultUser;

                    // UIリセット
                    this.placeMarkers();
                    this.hideQuestDetail();
                    this.hideEventDetail();
                    this.hideRewardPage();
                    if (this.activePopup) {
                        this.activePopup.close();
                        this.activePopup = null;
                    }

                    alert("リセット完了。初期状態に戻りました。");

                } catch (e) {
                    console.error("リセット失敗:", e);
                    alert("リセット中にエラーが発生しました。");
                } finally {
                    this.isTokenLoading = false;
                }
            },

            showPurchaseModal(spotId) {
                this.modalTargetSpot = this.spots.find(s => s.id === spotId);
                if (this.modalTargetSpot) { this.isPurchaseModalVisible = true; }
            },
            hidePurchaseModal() {
                this.isPurchaseModalVisible = false;
            },
            showLodgingModal(spotId) {
                this.modalTargetSpot = this.spots.find(s => s.id === spotId);
                if (this.modalTargetSpot) {
                    this.selectedLodgingPlan = null;
                    this.isLodgingModalVisible = true;
                }
            },
            hideLodgingModal() {
                this.isLodgingModalVisible = false;
            },
            selectLodgingPlan(plan) {
                this.selectedLodgingPlan = plan;
            },
            openLink(url) {
                if (url) {
                    if (navigator.onLine === false) {
                        alert("オフラインのため、外部リンクを開けません。");
                        return;
                    }
                    window.open(url, '_blank');
                } else {
                    alert('リンク先が設定されていません。');
                }
            },
            showAuthModal() {
                this.isAuthModalVisible = true;
                this.enteredAuthToken = '';
                this.authErrorMessage = '';
            },
            hideAuthModal() {
                this.isAuthModalVisible = false;
            },
            async loginWithAuthToken() {
                if (this.enteredAuthToken.length !== 6) {
                    this.authErrorMessage = "6桁の数字を入力してください。";
                    return;
                }
                
                if (!db) {
                     this.authErrorMessage = "本番データベースに接続できません。電波状況を確認するか、デモモードをお試しください。";
                     return;
                }
                
                this.isTokenLoading = true;
                this.isDemoMode = false; 
                this.authErrorMessage = '';
                
                try {
                    this.detachUserListener(); 
                    const token = this.enteredAuthToken;
                    const tokenRef = db.collection('authTokens').doc(token);
                    const tokenDoc = await tokenRef.get();
                    if (!tokenDoc.exists) {
                        this.authErrorMessage = "合言葉が正しくありません。";
                        this.isTokenLoading = false;
                        return;
                    }
                    const tokenData = tokenDoc.data();
                    const now = new Date();
                    const expiresAt = tokenData.expiresAt.toDate();
                    if (now > expiresAt) {
                        this.authErrorMessage = "合言葉の有効期限が切れています。スマホで再発行してください。";
                        await tokenRef.delete();
                        this.isTokenLoading = false;
                        return;
                    }
                    const userId = tokenData.userId;
                    
                    // 本番モードなので、Firebaseからデータを取得する
                    if (this.spots.length === 0) {
                        await this.fetchData('production');
                    }
                    
                    const userRef = db.collection('users').doc(userId);
                    this.userListener = userRef.onSnapshot((doc) => {
                        console.log("本番ユーザーデータが更新されました！");
                        if (doc.exists) {
                            this.currentUser = doc.data();
                        } else {
                            this.currentUser = { userId: userId, questProgress: {}, points: 0 };
                        }
                        this.placeMarkers();
                    }, (error) => {
                        console.error("データベースの監視に失敗しました:", error);
                    });
                    
                    console.log("連携成功！ データベースのリアルタイム監視を開始しました。");
                    this.hideAuthModal();
                    await tokenRef.delete();
                } catch (error) {
                    console.error("連携エラー:", error);
                    this.authErrorMessage = "連携中にエラーが発生しました。";
                } finally {
                    this.isTokenLoading = false;
                }
            },

            async startDemoMode() {
                this.isTokenLoading = true;
                this.isDemoMode = true; 
                this.authErrorMessage = '';
                
                try {
                    this.detachUserListener(); 
                    
                    // デモモードなので、ローカルJSONからデータを取得する
                    await this.fetchData('demo'); 
                    
                    if (!db) throw "デモモード（クラウド連携）にはDB接続が必要です。";

                    const userRef = db.collection('users').doc(DEMO_USER_ID);
                    
                    // 初回データがなければ作る
                    const docSnap = await userRef.get();
                    if (!docSnap.exists) {
                        await userRef.set({
                            userId: DEMO_USER_ID,
                            points: 5000,
                            questProgress: {}
                        });
                    }

                    // 監視開始 (スマホ操作の反映)
                    this.userListener = userRef.onSnapshot((doc) => {
                       console.log("デモ用クラウドデータが更新されました！(スマホ操作反映)");
                       if (doc.exists) {
                           this.currentUser = doc.data();
                       }
                       this.placeMarkers();
                    }, (error) => {
                       console.warn("デモモード: クラウド監視失敗。", error);
                    });
                    
                    console.log("デモモード(クラウド連携あり)を開始しました。");
                    this.hideAuthModal();

                } catch (error) {
                    console.error("デモモード開始エラー:", error);
                    this.authErrorMessage = "デモモードの開始に失敗しました。";
                } finally {
                    this.isTokenLoading = false;
                }
            },
            
            logout() {
                if (!confirm("連携を解除し、モード選択画面に戻りますか？")) {
                    return;
                }
                
                this.detachUserListener(); 
                
                this.currentUser = null;
                this.isDemoMode = false;
                
                this.spots = [];
                this.allQuests = [];
                this.rewards = [];
                
                this.placeMarkers(); 
                
                if (db) {
                    this.fetchData('production');
                } else {
                    this.showAuthModal();
                }
            },

            detachUserListener() {
                if (this.userListener) {
                    this.userListener(); 
                    this.userListener = null;
                    console.log("データベースの監視を停止しました。");
                }
            },

            isVideoFile(url) { 
                if (!url) return false;
                const lowerUrl = url.toLowerCase();
                return lowerUrl.includes('.mp4');
            },
            
            showRewardPage() {
                this.isRewardPageVisible = true;
            },

            hideRewardPage() {
                this.isRewardPageVisible = false;
            },

            canRedeem(reward) {
                return this.currentUser && this.currentUser.points >= reward.requiredPoints;
            },

            async redeemReward(reward) {
                if (this.isRedeeming || !this.canRedeem(reward)) {
                    return;
                }
                
                if (!confirm(`${reward.name}を ${reward.requiredPoints} マポを消費して交換しますか？`)) {
                    return;
                }

                this.isRedeeming = true;
                
                try {
                    if (!db) throw "データベースに接続されていません。";
                     
                     const userId = this.currentUser.userId;
                     const userRef = db.collection('users').doc(userId);
                     
                     await db.runTransaction(async (transaction) => {
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists) throw "ユーザーが見つかりません。";
                        
                        const currentPoints = userDoc.data().points || 0;
                        if (currentPoints < reward.requiredPoints) throw "マポが不足しています。";
                        
                        const newPoints = currentPoints - reward.requiredPoints;
                        transaction.update(userRef, { points: newPoints });
                     });
                     
                    console.log("クラウドでポイント交換完了");
                    alert(`🎉 ${reward.name}と交換しました！ 🎉`);

                } catch (error) {
                    console.error("景品交換エラー:", error);
                    alert("景品の交換中にエラーが発生しました: " + error);
                } finally {
                    this.isRedeeming = false;
                }
            }
        }
    });
    window.vueApp = app.mount('#app');
}