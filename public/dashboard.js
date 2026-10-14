const filterTanggal = document.getElementById('filterTanggal');
const tabelBody = document.getElementById('tabelBody');

// Header untuk skip halaman peringatan ngrok
const NGROK_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

// ===== 1. Set tanggal default ke data terbaru =====
async function setTanggalDefault() {
    try {
        const res = await fetch('/api/gps/list', { headers: NGROK_HEADERS });
        const data = await res.json();
        
        if (data.length > 0) {
            const timestamp = data[0].timestamp;
            const wib = new Date(timestamp + 7 * 60 * 60 * 1000);
            filterTanggal.value = wib.toISOString().split('T')[0];
        } else {
            filterTanggal.value = new Date().toISOString().split('T')[0];
        }
    } catch (error) {
        console.error('Error set tanggal:', error);
        filterTanggal.value = new Date().toISOString().split('T')[0];
    }
}

function formatWIB(timestamp) {
    return new Date(timestamp).toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta' 
    });
}


// ===== 2. Ambil data perjalanan =====
async function ambilDataPerjalanan() {
    const tanggal = filterTanggal.value;
    
    tabelBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-blue-500">Memuat data...</td></tr>`;

    try {
        const res = await fetch(`/api/perjalanan?tanggal=${tanggal}`, { headers: NGROK_HEADERS });
        const data = await res.json();

        // ===== Update ringkasan =====
        document.getElementById('txtBerangkat').innerText = data.perjalanan?.waktu_berangkat || '-';
        document.getElementById('txtTiba').innerText = data.perjalanan?.waktu_tiba || '-';
        document.getElementById('txtDurasi').innerText = data.perjalanan?.waktu_perjalanan_format || '-';
        document.getElementById('txtTotal').innerText = data.total_titik || 0;

        // ===== Update statistik kategori =====
        document.getElementById('txtRumah').innerText = data.ringkasan?.titik_rumah || 0;
        document.getElementById('txtJalan').innerText = data.ringkasan?.titik_jalan || 0;
        document.getElementById('txtKampus').innerText = data.ringkasan?.titik_kampus || 0;

        // ===== Kalau data kosong =====
        if (!data.detail || data.detail.length === 0) {
            tabelBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500">Tidak ada data perjalanan pada tanggal ini.</td></tr>`;
            return;
        }

        // ===== Render tabel =====
        tabelBody.innerHTML = "";
        
        data.detail.forEach(row => {
            let warnaKategori = "bg-gray-100 text-gray-700";
            let iconKategori = "❓";

            if (row.label === 'Rumah') {
                warnaKategori = "bg-red-100 text-red-800 font-semibold";
                iconKategori = "🏠";
            } else if (row.label === 'Kampus') {
                warnaKategori = "bg-green-100 text-green-800 font-semibold";
                iconKategori = "🏫";
            } else if (row.label === 'Di Jalan') {
                warnaKategori = "bg-yellow-100 text-yellow-800 font-semibold";
                iconKategori = "🚗";
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50";
            tr.innerHTML = `
                <td class="p-4 font-medium">${row.id}</td>
                <td class="p-4">$formatWIB({row.timestamp)}</td>
                <td class="p-4">${row.latitude.toFixed(6)}</td>
                <td class="p-4">${row.longitude.toFixed(6)}</td>
                <td class="p-4">${row.jarak_ke_rumah} m</td>
                <td class="p-4">${row.jarak_ke_kampus} m</td>
                <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full text-xs ${warnaKategori}">
                        ${iconKategori} ${row.label}
                    </span>
                </td>
            `;
            tabelBody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error:', error);
        tabelBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-red-500 font-semibold">⚠️ Error: ${error.message}</td></tr>`;
    }
}

// ===== 3. Init =====
setTanggalDefault().then(() => ambilDataPerjalanan());

// ===== 4. Filter change =====
filterTanggal.addEventListener('change', ambilDataPerjalanan);