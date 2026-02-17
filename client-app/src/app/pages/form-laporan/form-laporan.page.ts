import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { camera, send, mapOutline } from 'ionicons/icons';
import { DeliveryService } from '../../services/delivery.service';
import { AuthService } from '../../services/auth.service';
import * as L from 'leaflet';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

@Component({
  selector: 'app-form-laporan',
  templateUrl: './form-laporan.page.html',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class FormLaporanPage implements OnInit, OnDestroy {
  noResi = '';
  customerName = '';
  photoBase64: string | null = null;
  latitude: number = 0;
  longitude: number = 0;

  // Map Variables
  map: L.Map | undefined;
  marker: L.Marker | undefined;
  streetLayer: L.TileLayer | undefined;
  satelliteLayer: L.TileLayer | undefined;
  isSatellite = false;

  // Challenge Variables
  // kordinat my home
  targetLat = -6.716077;
  targetLng = 108.492221; 

  // kordinat kampus
  // targetLat = -6.742162;
  // targetLng = 108.493312; 
  distanceFromOffice: number | null = null;

  constructor(
    private deliveryService: DeliveryService,
    private auth: AuthService,
    private router: Router,
    private toast: ToastController,
    private loading: LoadingController,
    private alertCtrl: AlertController
  ) {
    addIcons({ camera, send, mapOutline });
  }

  ngOnInit() {
    setTimeout(() => {
      this.initMap();
      this.getCurrentLocation();
    }, 500);
  }

  ngOnDestroy() {
    if (this.map) this.map.remove();
  }

  initMap() {
    this.map = L.map('map').setView([this.targetLat, this.targetLng], 15);

    // Layer 1: Street View (OpenStreetMap)
    this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'OSM'
    });

    // Layer 2: Satellite View (Esri World Imagery) - CHALLENGE POINT
    this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri'
    });

    // Default pakai Street
    this.streetLayer.addTo(this.map);

    // Marker Target (Kantor)
    L.circle([this.targetLat, this.targetLng], { radius: 100, color: 'red', fillColor: '#f03', fillOpacity: 0.2 }).addTo(this.map)
      .bindPopup("Area Jangkauan (100m)");
  }

  toggleMapLayer() {
    if (!this.map || !this.streetLayer || !this.satelliteLayer) return;
    if (this.isSatellite) {
      this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
    }
    this.isSatellite = !this.isSatellite;
  }

  async getCurrentLocation() {
    try {
      const coordinates = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      this.latitude = coordinates.coords.latitude;
      this.longitude = coordinates.coords.longitude;

      this.updateMapMarker(this.latitude, this.longitude);
      this.checkDistance(this.latitude, this.longitude);

    } catch (e) {
      this.showToast('Gagal ambil lokasi GPS', 'danger');
    }
  }

  updateMapMarker(lat: number, lng: number) {
    if (!this.map) return;
    this.map.setView([lat, lng], 17);
    if (this.marker) this.map.removeLayer(this.marker);
    this.marker = L.marker([lat, lng]).addTo(this.map).bindPopup("Posisi Anda").openPopup();
  }

  // --- CHALLENGE: Logic Jarak (Haversine Formula) ---
  checkDistance(lat1: number, lon1: number) {
    const R = 6371e3; // Radius bumi dalam meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = this.targetLat * Math.PI / 180;
    const Δφ = (this.targetLat - lat1) * Math.PI / 180;
    const Δλ = (this.targetLng - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    this.distanceFromOffice = R * c; // Hasil dalam meter

    if (this.distanceFromOffice > 100) {
      this.showAlert("Peringatan Jarak", `Anda berada ${Math.floor(this.distanceFromOffice)}m dari pusat. Di luar jangkauan 100m!`);
    }
  }

  async takePicture() {
    const image = await Camera.getPhoto({
      quality: 80, allowEditing: false, resultType: CameraResultType.Base64, source: CameraSource.Camera
    });
    this.photoBase64 = `data:image/jpeg;base64,${image.base64String}`;
  }

  async submitData() {
    if (!this.noResi || !this.customerName || !this.photoBase64) {
      return this.showToast('Lengkapi data & foto!', 'warning');
    }

    const user = this.auth.getUser();
    const loader = await this.loading.create({ message: 'Mengirim...' });
    await loader.present();

    const payload = {
      user_id: user.id,
      no_resi: this.noResi,
      customer_name: this.customerName,
      photo_path: this.photoBase64,
      latitude: this.latitude,
      longitude: this.longitude
    };

    this.deliveryService.createDelivery(payload).subscribe({
      next: () => {
        loader.dismiss();
        this.showToast('Laporan Terkirim!', 'success');
        this.router.navigate(['/home']);
      },
      error: () => {
        loader.dismiss();
        this.showToast('Gagal kirim data', 'danger');
      }
    });
  }

  async showToast(msg: string, color: string) {
    const t = await this.toast.create({ message: msg, duration: 2000, color: color });
    t.present();
  }

  async showAlert(header: string, msg: string) {
    const alert = await this.alertCtrl.create({ header, message: msg, buttons: ['OK'] });
    await alert.present();
  }
}