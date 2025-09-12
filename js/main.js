// グローバルスコープの変数宣言
let adScreen, mainContent, adVideo;
let fixedUrlButton; // <-- ① この行を追加

// 広告画面に遷移するグローバル関数
function goToAdScreen() {
    if (window.vueApp && window.vueApp.currentUser) {
        window.vueApp.detachUserListener();
    }
    if (mainContent && adScreen && adVideo) {
        fixedUrlButton.style.display = 'none'; // <-- ② この行を追加
        mainContent.classList.add('hidden');
        adScreen.style.display = 'block';
        if (adVideo.paused) {
            adVideo.play().catch(e => console.error("Video play failed:", e));
        }
        adVideo.volume = 1.0;
        if (window.vueApp && window.vueApp.activeInfoWindow) {
            window.vueApp.activeInfoWindow.close();
        }
        // ▼▼▼ 追加 ▼▼▼
        // 他のページが表示されていたら非表示にする
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
    fixedUrlButton = document.getElementById('fixed-url-button'); // <-- ③ この行を追加

    if (!adScreen || !mainContent || !adVideo) {
        console.error("必要なHTML要素が見つかりません。");
        return;
    }

    const adVideos = ['https://firebasestorage.googleapis.com/v0/b/pilgrimage-quest-app.firebasestorage.app/o/%E3%82%81%E3%81%B6%E3%81%8F%E7%B8%A6%E7%94%BB%E9%9D%A2.mp4?alt=media&token=7f43cfc8-1fb1-4960-953d-e545496eff8b'];
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
        fixedUrlButton.style.display = 'block'; // <-- ④ この行を追加
        adScreen.style.display = 'none';
        mainContent.classList.remove('hidden');
        resetInactivityTimer();

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
});


// 【重要】Firebaseプロジェクト作成時にコピーした設定情報をここに貼り付けます
const firebaseConfig = {
    apiKey: "AIzaSyAxZffh198by405B4t64hTMyEFatYiX92A",
    authDomain: "point-tuika.firebaseapp.com",
    projectId: "point-tuika",
    storageBucket: "point-tuika.firebasestorage.app",
    messagingSenderId: "763384904606",
    appId: "1:763384904606:web:8d7556d0089b5f9f08b48f"
  };

// Firebaseアプリの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();


// Google Maps APIのコールバック関数
function initMap() {
    const app = Vue.createApp({
        data() {
            return {
                map: null,
                header: null,
                spots: [],
                allQuests: [],
                markers: [],
                activeInfoWindow: null,
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
                // ▼▼▼ 新規追加 ▼▼▼
                isRewardPageVisible: false, // 景品交換ページの表示状態
                rewards: [], // 景品リスト
                isRedeeming: false, // 交換処理中の状態
            };
        },
        mounted() {
            this.map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 36.39168771404707, lng: 139.06995217545418 },
                zoom: 17,
                gestureHandling: 'greedy',
            });

            this.map.addListener('click', () => {
                if (this.activeInfoWindow) {
                    this.activeInfoWindow.close();
                    this.activeInfoWindow = null;
                }
                this.hideEventDetail();
                this.hideQuestDetail();
            });
            
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
            });

            this.fetchDataFromFirestore();
        },
        methods: {
            handleBackToAdClick() {
                goToAdScreen();
            },
            async fetchDataFromFirestore() {
                try {
                    const headerDoc = await db.collection('config').doc('header').get();
                    if (headerDoc.exists) {
                        this.header = headerDoc.data();
                    }

                    const spotsSnapshot = await db.collection('spots').get();
                    const questsSnapshot = await db.collection('quests').get();
                    // ▼▼▼ 新規追加 ▼▼▼
                    const rewardsSnapshot = await db.collection('prizes').orderBy('requiredPoints', 'asc').get();


                    this.allQuests = questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    const spotsList = [];
                    spotsSnapshot.forEach((doc) => {
                        spotsList.push({ id: doc.id, ...doc.data() });
                    });
                    
                    this.spots = spotsList;
                    this.placeMarkers();

                    // ▼▼▼ 新規追加 ▼▼▼
                    this.rewards = rewardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                } catch (error) {
                    console.error("Firestoreからのデータ取得エラー: ", error);
                    alert('データの取得中にエラーが発生しました。');
                }
            },
            placeMarkers() {
                this.markers.forEach(markerInfo => markerInfo.gmapMarker.setMap(null));
                this.markers = [];

                this.spots.forEach(spot => {
                    const position = {
                        lat: parseFloat(spot.latitude),
                        lng: parseFloat(spot.longitude)
                    };
                    
                    const questStatus = this.currentUser ? this.currentUser.questProgress[spot.questId] : undefined;
                    
                    let pinColor = "#EA4335"; // デフォルト（未着手）は赤
                    if (questStatus === 'in_progress') pinColor = "#FBBC04"; // 進行中は黄色
                    if (questStatus === 'completed') pinColor = "#34A853"; // 完了は緑
                    
                    const marker = new google.maps.Marker({
                        position: position,
                        map: this.map,
                        title: spot.name,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 12,
                            fillColor: pinColor,
                            fillOpacity: 1,
                            strokeWeight: 1,
                            strokeColor: '#fff'
                        }
                    });
                    
                    const spotImageHtml = spot.detail_image ? `<img src="${spot.detail_image}" alt="${spot.name}" class="info-window-spot-image">` : '';
                    let spotDetailsHtml = '<div class="info-window-spot-details">';
                    if (spot.comment) spotDetailsHtml += `<p>${spot.comment}</p>`;
                    if (spot.address) spotDetailsHtml += `<p><strong>住所:</strong> ${spot.address}</p>`;
                    if (spot.phone) spotDetailsHtml += `<p><strong>電話:</strong> ${spot.phone}</p>`;
                    if (spot.hours) spotDetailsHtml += `<p><strong>時間:</strong> ${spot.hours}</p>`;
                    spotDetailsHtml += '</div>';

                    let goodsHtml = '';
                    if (spot.goods_name) {
                        goodsHtml = `<div class="info-window-goods"><img src="${spot.goods_image || ''}" alt="${spot.goods_name}" class="info-window-goods-image"><div class="info-window-goods-details"><strong>${spot.goods_name}</strong><span>${spot.goods_price}</span></div></div><button class="info-window-btn purchase" onclick="window.vueApp.showPurchaseModal('${spot.id}')">購入する</button>`;
                    }
                    let lodgingButtonHtml = '';
                    if (spot.lodging_plans && spot.lodging_plans.length > 0) {
                        lodgingButtonHtml = `<button class="info-window-btn lodging" onclick="window.vueApp.showLodgingModal('${spot.id}')">宿泊プランを見る</button>`;
                    }
                    let questButtonHtml = '';
                    if (spot.questId) {
                        questButtonHtml = `<button class="info-window-btn start-quest-btn" data-quest-id="${spot.questId}">クエストを受注する</button>`;
                    }
                    
                    const infoWindow = new google.maps.InfoWindow({
                        content: `
                            <div class="info-window">
                                <h6 class="info-window-header">${spot.name}</h6>
                                <div class="info-window-content">
                                    ${spotImageHtml}
                                    ${spotDetailsHtml}
                                    ${goodsHtml}
                                    ${lodgingButtonHtml}
                                    ${questButtonHtml} 
                                    <button class="event-btn" data-spot-name="${spot.name}">周辺のイベント情報はこちら</button>
                                </div>
                            </div>
                        `,
                        disableAutoPan: true
                    });

                    marker.addListener('click', (e) => {
                        this.onSpotClick(spot.name);
                    });

                    this.markers.push({ gmapMarker: marker, infoWindow: infoWindow, spotData: spot });
                });
            },
            onSpotClick(spotName) {
                if (this.isAnimating) {
                    cancelAnimationFrame(this.animationFrameId);
                }
                const target = this.markers.find(m => m.spotData.name === spotName);
                if (target) {
                    this.openInfoWindow(target.infoWindow, target.gmapMarker);
                    const destination = target.gmapMarker.getPosition();
                    this.flyTo(destination, 17.5);
                }
            },
            openInfoWindow(infoWindow, marker) {
                if (this.activeInfoWindow) {
                    this.activeInfoWindow.close();
                }
                infoWindow.open(this.map, marker);
                this.activeInfoWindow = infoWindow;
            },
            easing(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
            
            flyTo(destination, endZoom) {
                this.isAnimating = true;
                const duration = 4000;
                let startTime = null;

                const projection = this.map.getProjection();
                if (!projection) {
                    this.map.moveCamera({ center: destination, zoom: endZoom });
                    this.isAnimating = false;
                    return;
                }
                const destPoint = projection.fromLatLngToPoint(destination);
                const scale = Math.pow(2, endZoom);
                
                const offsetX = 150;
                const offsetY = 250;

                const offsetPoint = new google.maps.Point(offsetX / scale, offsetY / scale);
                const newCenterPoint = new google.maps.Point(destPoint.x - offsetPoint.x, destPoint.y - offsetPoint.y);
                const newCenterLatLng = projection.fromPointToLatLng(newCenterPoint);

                const p0 = {
                    lat: this.map.getCenter().lat(),
                    lng: this.map.getCenter().lng(),
                    zoom: this.map.getZoom()
                };
                const p2 = {
                    lat: newCenterLatLng.lat(),
                    lng: newCenterLatLng.lng(),
                    zoom: endZoom
                };

                const distance = Math.sqrt(Math.pow(p2.lat - p0.lat, 2) + Math.pow(p2.lng - p0.lng, 2));
                const arcHeight = Math.max(0.5, Math.min(distance * 0, 0.1));

                const p1 = {
                    lat: (p0.lat + p2.lat) / 2,
                    lng: (p0.lng + p2.lng) / 2,
                    zoom: Math.min(p0.zoom, p2.zoom) - arcHeight
                };

                const frame = (currentTime) => {
                    if (!startTime) startTime = currentTime;
                    const progress = Math.min((currentTime - startTime) / duration, 1);
                    const t = this.easing(progress);

                    const currentLat = Math.pow(1 - t, 2) * p0.lat + 2 * (1 - t) * t * p1.lat + Math.pow(t, 2) * p2.lat;
                    const currentLng = Math.pow(1 - t, 2) * p0.lng + 2 * (1 - t) * t * p1.lng + Math.pow(t, 2) * p2.lng;
                    const currentZoom = Math.pow(1 - t, 2) * p0.zoom + 2 * (1 - t) * t * p1.zoom + Math.pow(t, 2) * p2.zoom;

                    this.map.moveCamera({
                        center: { lat: currentLat, lng: currentLng },
                        zoom: currentZoom
                    });

                    if (progress < 1) {
                        this.animationFrameId = requestAnimationFrame(frame);
                    } else {
                        this.isAnimating = false;
                        this.animationFrameId = null;
                    }
                };
                this.animationFrameId = requestAnimationFrame(frame);
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
                            prize: spotData[`event${i}_prize`],
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
                    const questRef = db.collection('quests').doc(questId);
                    const questDoc = await questRef.get();

                    if (questDoc.exists) {
                        const questData = questDoc.data();
                        this.currentQuestForDetail = {
                            title: questData.title,
                            image: questData.image,
                            description: questData.description,
                            clearCondition: questData.clearCondition,
                            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=QUEST_START::${questId}`
                        };
                        this.isQuestDetailVisible = true;
                    } else {
                        console.error("指定されたクエストが見つかりません:", questId);
                        alert("クエスト情報の読み込みに失敗しました。");
                    }
                } catch (error) {
                    console.error("クエスト情報の取得エラー:", error);
                    alert("エラーが発生しました。");
                }
            },
            hideQuestDetail() {
                this.isQuestDetailVisible = false;
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
                this.isTokenLoading = true;
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
                    
                    const userRef = db.collection('users').doc(userId);
                    this.userListener = userRef.onSnapshot((doc) => {
                        console.log("ユーザーデータが更新されました！");
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
            detachUserListener() {
                if (this.userListener) {
                    this.userListener();
                    this.userListener = null;
                    this.currentUser = null;
                    this.placeMarkers();
                    console.log("データベースの監視を停止しました。");
                }
            },
            // ▼▼▼ ここから下のメソッドを全て新規・修正 ▼▼▼
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
                const userRef = db.collection('users').doc(this.currentUser.userId);

                try {
                    await db.runTransaction(async (transaction) => {
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists) {
                            throw "ユーザーが見つかりません。";
                        }

                        const currentPoints = userDoc.data().points || 0;
                        if (currentPoints < reward.requiredPoints) {
                            throw "マポが不足しています。";
                        }
                        
                        const newPoints = currentPoints - reward.requiredPoints;
                        transaction.update(userRef, { points: newPoints });
                    });
                    
                    // ここで物理的な景品を出すための処理を呼び出す（将来的な拡張）
                    console.log(`${reward.name} の交換処理が完了しました。`);
                    alert(`🎉 ${reward.name}と交換しました！ 🎉`);

                } catch (error) {
                    console.error("景品交換エラー:", error);
                    alert("景品の交換中にエラーが発生しました。ポイントを確認して再度お試しください。");
                } finally {
                    this.isRedeeming = false;
                }
            }
        }
    });
    window.vueApp = app.mount('#app');
}