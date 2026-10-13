const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

//Titik referensi
const TITIK_RUMAH = {
  nama: 'Rumah (Dapur)',
  lat: -6.85840509573281,   // ← GANTI dengan latitude rumah
  lon: 107.4824106662577   // ← GANTI dengan longitude rumah
};

const TITIK_KAMPUS = {
  nama: 'Kampus (Sekolah1)',
  lat: -6.87512870432801,    // ← GANTI dengan latitude rumah
  lon: 107.6048910527648   // ← GANTI dengan longitude rumah
};

const TITIK_KAMPUS2 = {
  nama: 'Kampus (Sekolah2)',
  lat: -6.897620967099666,    // ← GANTI dengan latitude rumah
  lon: 107.60633916440877   // ← GANTI dengan longitude rumah
};

const RADIUS_METER = 100;

// Middleware untuk membaca JSON dari request body
app.use(bodyParser.json());
app.use(express.static('public'));

// Koneksi ke database (file akan otomatis dibuat)
const db = new sqlite3.Database('./database.db');

// Buat tabel jika belum ada
db.serialize(() => {
  // Tabel untuk data GPS
  db.run(`CREATE TABLE IF NOT EXISTS gps_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    latitude REAL,
    longitude REAL,
    timestamp INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabel untuk data akselerometer
  db.run(`CREATE TABLE IF NOT EXISTS accelerometer_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    x REAL,
    y REAL,
    z REAL,
    timestamp INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Endpoint untuk menerima data GPS
app.post('/api/gps', (req, res) => {
  const { device_id, latitude, longitude, timestamp } = req.body;

  // Validasi sederhana
  if (!device_id || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  const sql = `INSERT INTO gps_data (device_id, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)`;
  db.run(sql, [device_id, latitude, longitude, timestamp || Date.now()], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Gagal menyimpan data' });
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Endpoint untuk menerima data akselerometer
app.post('/api/accelerometer', (req, res) => {
  const { device_id, x, y, z, timestamp } = req.body;

  if (!device_id || x == null || y == null || z == null) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  const sql = `INSERT INTO accelerometer_data (device_id, x, y, z, timestamp) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [device_id, x, y, z, timestamp || Date.now()], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Gagal menyimpan data' });
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Endpoint untuk melihat semua data GPS
app.get('/api/gps/list', (req, res) => {
  db.all('SELECT * FROM gps_data ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Endpoint untuk melihat semua data akselerometer
app.get('/api/accelerometer/list', (req, res) => {
  db.all('SELECT * FROM accelerometer_data ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Fungsi Haversine untuk menghitung jarak antara dua titik GPS
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000; // Radius bumi dalam m

  const dLat = toRad(lat2 - lat1); 
  const dLon = toRad(lon2 - lon1);

  // sin²(dLat/2) → kontribusi lintang
  // cos(lat1) × cos(lat2) × sin²(dLon/2) → kontribusi bujur
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  //c = sudut pusat Bumi, dalam radian
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  //jarak = radius * sudut
  return R * c; // Jarak dalam meter
}

// Endpoint untuk menghitung jarak & kecepatan antara dua titik GPS
// Endpoint untuk menghitung jarak & kecepatan antara dua titik GPS
app.get('/api/gps/distance', (req, res) => {
  const tanggal = req.query.tanggal; // format: YYYY-MM-DD

  let query, params;

  if (tanggal) {
    // Filter pakai WIB — akurat
    query = `
      SELECT * FROM gps_data 
      WHERE date(timestamp / 1000, 'unixepoch', '+7 hours') = ?
      ORDER BY timestamp ASC
    `;
    params = [tanggal];
  } else {
    query = 'SELECT * FROM gps_data ORDER BY timestamp ASC';
    params = [];
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (rows.length < 2) {
      return res.json({
        total_data: rows.length,
        total_pasangan: 0,
        total_jarak_km: 0,
        total_waktu_menit: 0,
        total_waktu_format: '0 menit',
        kecepatan_rata2_kmh: 0,
        kecepatan_maksimum_kmh: 0,
        detail: []
      });
    }

    const hasil = [];
    let totalDistance = 0;
    let totalTime = 0;
    let maxKecepatan = 0;

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];

      const distance = haversine(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000;
      const speedKmh = timeDiff > 0 ? distance / timeDiff * 3.6 : 0;

      totalDistance += distance;
      totalTime += timeDiff;
      maxKecepatan = Math.max(maxKecepatan, speedKmh);

      hasil.push({
        dari: prev.id,
        ke: curr.id,
        mulai_dari: new Date(prev.timestamp).toLocaleString('id-ID'),
        selesai_di: new Date(curr.timestamp).toLocaleString('id-ID'),
        jarak_meter: Math.round(distance),
        kecepatan_kmh: Math.round(speedKmh * 100) / 100,
        status: speedKmh < 1 ? 'Berhenti'
              : speedKmh < 20 ? 'Pelan'
              : speedKmh < 40 ? 'Sedang'
              : speedKmh < 60 ? 'Cepat'
              : 'Ugal-ugalan'
      });
    }

    const jam = Math.floor(totalTime / 3600);
    const menit = Math.floor((totalTime % 3600) / 60);
    const detik = Math.floor(totalTime % 60);
    const totalWaktuFormat = jam > 0 
      ? `${jam} jam ${menit} menit ${detik} detik` 
      : `${menit} menit ${detik} detik`;

    res.json({
      total_data: rows.length,
      total_pasangan: hasil.length,
      total_jarak_km: Math.round(totalDistance / 1000 * 100) / 100,
      total_waktu_menit: Math.round(totalTime / 60 * 10) / 10,
      total_waktu_format: totalWaktuFormat,
      kecepatan_maksimum_kmh: Math.round(maxKecepatan * 10) / 10,   // ← diperbaiki
      detail: hasil
    });
  });
});

// Analisis Perjalanan (Klasifikasi Titik)
// ===== Endpoint: Analisis Perjalanan (Klasifikasi Titik) =====
app.get('/api/perjalanan', (req, res) => {
    const tanggal = req.query.tanggal;
    
    let query, params;
    
    if (tanggal) {
        query = `
            SELECT * FROM gps_data 
            WHERE date(timestamp / 1000, 'unixepoch', '+7 hours') = ?
            ORDER BY timestamp ASC
        `;
        params = [tanggal];
    } else {
        query = 'SELECT * FROM gps_data ORDER BY timestamp ASC';
        params = [];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (rows.length === 0) {
            return res.json({
                status: 'Tidak ada data',
                total_titik: 0,
                detail: []
            });
        }
        
        // ===== Klasifikasi setiap titik =====
        const titikKlasifikasi = rows.map(row => {
            const jarakKeRumah = haversine(
                row.latitude, row.longitude,
                TITIK_RUMAH.lat, TITIK_RUMAH.lon
            );
            
            const jarakKeKampus = haversine(
                row.latitude, row.longitude,
                TITIK_KAMPUS.lat, TITIK_KAMPUS.lon
            );
            
            let label;
            if (jarakKeRumah < RADIUS_METER) {
                label = 'Rumah';
            } else if (jarakKeKampus < RADIUS_METER) {
                label = 'Kampus';
            } else {
                label = 'Di Jalan';
            }
            
            return {
                id: row.id,
                latitude: row.latitude,
                longitude: row.longitude,
                timestamp: row.timestamp,
                waktu: new Date(row.timestamp).toLocaleString('id-ID'),
                jarak_ke_rumah: Math.round(jarakKeRumah),
                jarak_ke_kampus: Math.round(jarakKeKampus),
                label: label
            };
        });
        
        // ===== Cari titik rumah & kampus =====
        const titikRumah = titikKlasifikasi.filter(t => t.label === 'Rumah');
        const titikKampus = titikKlasifikasi.filter(t => t.label === 'Kampus');
        const titikJalan = titikKlasifikasi.filter(t => t.label === 'Di Jalan');
        
        // ===== Hitung waktu perjalanan =====
        let waktuBerangkat = null;
        let waktuTiba = null;
        let waktuPerjalananMenit = 0;
        let waktuPerjalananFormat = '-';
        
        if (titikRumah.length > 0 && titikKampus.length > 0) {
            // Titik rumah TERAKHIR (saat benar-benar berangkat)
            const rumahTerakhir = titikRumah[titikRumah.length - 1];
            // Titik kampus PERTAMA (saat benar-benar tiba)
            const kampusPertama = titikKampus[0];
            
            waktuBerangkat = rumahTerakhir.waktu;
            waktuTiba = kampusPertama.waktu;
            
            const selisihMs = kampusPertama.timestamp - rumahTerakhir.timestamp;
            waktuPerjalananMenit = Math.round(selisihMs / 1000 / 60);
            
            const jam = Math.floor(waktuPerjalananMenit / 60);
            const menit = waktuPerjalananMenit % 60;
            waktuPerjalananFormat = jam > 0 
                ? `${jam} jam ${menit} menit` 
                : `${menit} menit`;
        }
        
        // ===== Kirim hasil =====
        res.json({
            tanggal: tanggal || 'semua',
            titik_referensi: {
                rumah: TITIK_RUMAH,
                kampus: TITIK_KAMPUS,
                radius_meter: RADIUS_METER
            },
            total_titik: titikKlasifikasi.length,
            ringkasan: {
                titik_rumah: titikRumah.length,
                titik_kampus: titikKampus.length,
                titik_jalan: titikJalan.length
            },
            perjalanan: {
                waktu_berangkat: waktuBerangkat,
                waktu_tiba: waktuTiba,
                waktu_perjalanan_menit: waktuPerjalananMenit,
                waktu_perjalanan_format: waktuPerjalananFormat,
                status: waktuPerjalananMenit > 0 ? 'Berhasil dihitung' : 'Data tidak lengkap'
            },
            detail: titikKlasifikasi
        });
    });
});

// Jalankan server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});