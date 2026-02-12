// ==============================================
// VEHICLE INSPECTION SYSTEM - V3
// ==============================================

let vehiclesData = [];
let inspectionsData = [];
let analyticsData = {};
let selectedVehicleId = null;
let divisionChart = null;
let inspectionStatusChart = null;
let selectedDivision = null; // Track division filter for doughnut chart

// Register datalabels plugin
Chart.register(ChartDataLabels);

// ==============================================
// UTILITY
// ==============================================

function showSuccessMessage(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:15px 25px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;font-weight:600;animation:slideIn 0.3s ease-out;';
  document.body.appendChild(d);
  setTimeout(() => { d.style.animation = 'slideOut 0.3s ease-out'; setTimeout(() => d.remove(), 300); }, 3000);
}

function showErrorMessage(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:15px 25px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;font-weight:600;';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 5000);
}

// ==============================================
// API HELPERS
// ==============================================

async function loadVehiclesData() {
  try { const r = await fetch('/get_vehicles'); if (!r.ok) throw 0; vehiclesData = await r.json(); return true; }
  catch(e) { showErrorMessage('Failed to load vehicles'); return false; }
}
async function loadInspectionsData() {
  try { const r = await fetch('/get_inspections'); if (!r.ok) throw 0; inspectionsData = await r.json(); return true; }
  catch(e) { return false; }
}
async function loadAnalyticsData() {
  try { const r = await fetch('/get_analytics'); if (!r.ok) throw 0; analyticsData = await r.json(); return true; }
  catch(e) { return false; }
}
async function apiPost(url, data) {
  try { const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }); return await r.json(); }
  catch(e) { return { success: false, message: e.message }; }
}
async function apiPut(url, data) {
  try { const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }); return await r.json(); }
  catch(e) { return { success: false, message: e.message }; }
}
async function apiDelete(url) {
  try { const r = await fetch(url, { method:'DELETE' }); return await r.json(); }
  catch(e) { return { success: false, message: e.message }; }
}

// ==============================================
// CHARTS with datalabels (numbers + percentage)
// ==============================================

function updateVehiclesByDivision() {
  const ctx = document.getElementById('divisionChart');
  if (!ctx) return;
  if (divisionChart) divisionChart.destroy();

  const dd = analyticsData.divisionData || {};
  const labels = Object.keys(dd);
  const data = Object.values(dd);
  const total = data.reduce((a, b) => a + b, 0);

  if (!labels.length) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  divisionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Vehicles',
        data: data,
        backgroundColor: labels.map(function(l) {
          var colors = ['#0f766e','#14b8a6','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
          var idx = labels.indexOf(l) % colors.length;
          // Dim non-selected bars when a division is selected
          if (selectedDivision && l !== selectedDivision) return colors[idx] + '40';
          return colors[idx];
        }),
        borderRadius: 8, borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 30 } },
      onClick: function(evt, elements) {
        if (elements.length > 0) {
          var clickedLabel = labels[elements[0].index];
          if (selectedDivision === clickedLabel) {
            // Clicking same bar again = reset
            selectedDivision = null;
          } else {
            selectedDivision = clickedLabel;
          }
          updateVehiclesByDivision();
          updateCarInspectionStatus();
          updateDivisionFilterIndicator();
        }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end', align: 'top',
          color: '#0f172a',
          font: { weight: 'bold', size: 13, family: "'Inter',sans-serif" },
          formatter: function(value) {
            var pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return value + ' (' + pct + '%)';
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#e2e8f0' } },
        x: { grid: { display: false }, ticks: { font: { weight: '600', size: 11 } } }
      }
    }
  });
}

function updateCarInspectionStatus() {
  const ctx = document.getElementById('inspectionStatusChart');
  if (!ctx) return;
  if (inspectionStatusChart) inspectionStatusChart.destroy();

  var passed = 0, action = 0, notInspected = 0;

  if (selectedDivision) {
    // Filter vehicles by selected division
    var divVehicles = vehiclesData.filter(function(v) { return v.division === selectedDivision; });
    var divVehicleIds = divVehicles.map(function(v) { return v.id; });

    divVehicles.forEach(function(v) {
      var vehicleInspections = inspectionsData
        .filter(function(i) { return Number(i.vehicleId) === Number(v.id); })
        .sort(function(a, b) { return new Date(b.inspectionDate) - new Date(a.inspectionDate); });
      
      if (vehicleInspections.length > 0) {
        var lastStatus = vehicleInspections[0].overallStatus;
        if (lastStatus === 'Passed') passed++;
        else if (lastStatus === 'Action Required') action++;
        else notInspected++;
      } else if (v.status === 'Passed') {
        passed++;
      } else if (v.status === 'Action Required') {
        action++;
      } else {
        notInspected++;
      }
    });
  } else {
    // Use global analytics data
    var sd = analyticsData.inspectionStatus || {};
    passed = sd['Passed'] || 0;
    action = sd['Action Required'] || 0;
    notInspected = sd['Not Inspected'] || 0;
  }

  var labels = ['Passed', 'Action Required', 'Not Inspected'];
  var data = [passed, action, notInspected];
  var total = data.reduce((a, b) => a + b, 0);

  if (total === 0) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  inspectionStatusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: ['#00843D','#f59e0b','#94a3b8'], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 15, font: { size: 11 } } },
        datalabels: {
          color: '#333',
          font: { weight: 'bold', size: 14 },
          formatter: function(value) {
            if (value === 0) return '';
            var pct = Math.round((value / total) * 100);
            return value + ' (' + pct + '%)';
          }
        }
      }
    }
  });
}

// ==============================================
// DIVISION FILTER INDICATOR
// ==============================================

function updateDivisionFilterIndicator() {
  var container = document.getElementById('divisionFilterIndicator');
  if (!container) return;
  if (selectedDivision) {
    container.innerHTML = '<div style="display:inline-flex;align-items:center;gap:8px;background:#e0f2fe;border:1px solid #7dd3fc;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#0369a1;">' +
      '<span>📊 Filtered: ' + selectedDivision + '</span>' +
      '<button onclick="clearDivisionFilter()" style="background:#0369a1;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;" title="Clear filter">&times;</button>' +
    '</div>';
  } else {
    container.innerHTML = '';
  }
}

function clearDivisionFilter() {
  selectedDivision = null;
  updateVehiclesByDivision();
  updateCarInspectionStatus();
  updateDivisionFilterIndicator();
}

// ==============================================
// DASHBOARD TABLES
// ==============================================

function updateDashboardVehicleTable() {
  const tbody = document.getElementById('dashboardVehicleBody');
  if (!tbody) return;
  if (!vehiclesData.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No vehicles found</td></tr>'; return; }

  tbody.innerHTML = vehiclesData.map(function(v) {
    var last = inspectionsData.filter(function(i){ return Number(i.vehicleId) === Number(v.id); }).sort(function(a,b){ return new Date(b.inspectionDate) - new Date(a.inspectionDate); })[0];
    var badge;
    if (last) {
      badge = last.overallStatus === 'Passed'
        ? '<span style="background:#00843D;color:white;padding:4px 12px;border-radius:12px;font-size:12px;"> Passed</span>'
        : '<span style="background:#f59e0b;color:white;padding:4px 12px;border-radius:12px;font-size:12px;"> Action</span>';
    } else if (v.status === 'Passed') {
      badge = '<span style="background:#00843D;color:white;padding:4px 12px;border-radius:12px;font-size:12px;"> Passed</span>';
    } else if (v.status === 'Action Required') {
      badge = '<span style="background:#f59e0b;color:white;padding:4px 12px;border-radius:12px;font-size:12px;"> Action</span>';
    } else {
      badge = '<span style="background:#94a3b8;color:white;padding:4px 12px;border-radius:12px;font-size:12px;"> Not Inspected</span>';
    }
    return '<tr><td><strong>'+(v.doorNo||'-')+'</strong></td><td>'+(v.plateNo||'-')+'</td><td>'+(v.division||'-')+'</td><td>'+(v.vehicleType||'-')+'</td><td>'+badge+'</td></tr>';
  }).join('');
}

function updateRecentActivities() {
  const tbody = document.getElementById('dashboardActivityBody');
  if (!tbody) return;
  if (!inspectionsData.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No recent activities</td></tr>'; return; }

  var recent = inspectionsData.slice().sort(function(a,b){ return new Date(b.inspectionDate)-new Date(a.inspectionDate); }).slice(0,5);
  tbody.innerHTML = recent.map(function(i) {
    var badge = i.overallStatus === 'Passed'
      ? '<span style="background:#00843D;color:white;padding:4px 12px;border-radius:12px;font-size:12px;">Passed</span>'
      : '<span style="background:#f59e0b;color:white;padding:4px 12px;border-radius:12px;font-size:12px;">Action Required</span>';
    
    var viewBtn = '<button onclick="viewInspectionDetails(\'' + i.inspectionId + '\')" style="padding:6px 16px;border:1px solid #0f766e;color:#0f766e;background:white;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">View</button>';
    
    return '<tr><td>'+new Date(i.inspectionDate).toLocaleDateString()+'</td><td>'+i.doorNo+' - '+i.plateNo+'</td><td>'+i.inspectorName+'</td><td>'+badge+'</td><td>'+viewBtn+'</td></tr>';
  }).join('');
}

function updateDashboard() {
  updateDashboardVehicleTable();
  updateCarInspectionStatus();
  updateVehiclesByDivision();
  updateRecentActivities();
}

// ==============================================
// CAR HISTORY
// ==============================================

function updateCarHistory() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;
  if (!inspectionsData.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:48px;margin-bottom:10px;">📋</div><div style="font-size:16px;font-weight:600;">No Inspection History</div></td></tr>';
    return;
  }
  var sorted = inspectionsData.slice().sort(function(a,b){ return new Date(b.inspectionDate)-new Date(a.inspectionDate); });
  tbody.innerHTML = sorted.map(function(i) {
    var badge = i.overallStatus==='Passed'
      ? '<span style="background:#00843D;color:white;padding:6px 14px;border-radius:12px;font-size:12px;font-weight:600;">✓ Passed</span>'
      : '<span style="background:#f59e0b;color:white;padding:6px 14px;border-radius:12px;font-size:12px;font-weight:600;">⚠ Action Required</span>';
    
    var viewBtn = '<button onclick="viewInspectionDetails(\'' + i.inspectionId + '\')" style="padding:6px 16px;border:1px solid #0f766e;color:#0f766e;background:white;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">View Details</button>';
    
    return '<tr><td><strong>'+new Date(i.inspectionDate).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})+'</strong></td><td><strong>'+i.doorNo+'</strong> - '+i.plateNo+'</td><td>'+i.inspectorName+'<br><small style="color:#64748b;">ID: '+i.inspectorId+'</small></td><td>'+badge+'</td><td>'+viewBtn+'</td></tr>';
  }).join('');
}

// ==============================================
// VEHICLE DROPDOWN (Inspection)
// ==============================================

function populateVehicleDropdown() {
  var sel = document.getElementById('vehicleSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select a vehicle --</option>';
  vehiclesData.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.doorNo + ' - ' + v.plateNo + ' (' + (v.division || 'N/A') + ')';
    sel.appendChild(opt);
  });
}

function handleVehicleSelection() {
  var sel = document.getElementById('vehicleSelect');
  if (!sel) return;
  sel.addEventListener('change', function() {
    var vid = parseInt(this.value);
    if (!vid) { clearInspectionForm(); return; }
    var v = vehiclesData.find(function(x){ return Number(x.id) === Number(vid); });
    if (!v) return;
    document.getElementById('divUnit').value = v.division || '';
    document.getElementById('doorNo').value = v.doorNo || '';
    document.getElementById('plateNo').value = v.plateNo || '';
    document.getElementById('vehicleType').value = v.vehicleType || '';
    var sz = v.vehicleSize || '4x2';
    var radio = document.querySelector('input[name="vehicleSize"][value="'+sz+'"]');
    if (radio) { radio.checked = true; toggleOffroadItems(sz); }
    selectedVehicleId = vid;
    showSuccessMessage('Vehicle details loaded!');
  });
}

function clearInspectionForm() {
  document.getElementById('divUnit').value = '';
  document.getElementById('doorNo').value = '';
  document.getElementById('plateNo').value = '';
  document.getElementById('vehicleType').value = '';
  document.querySelectorAll('input[name="vehicleSize"]').forEach(function(r){ r.checked = false; });
  toggleOffroadItems('4x2');
  selectedVehicleId = null;
}

// ==============================================
// OFFROAD TOGGLE
// ==============================================

function toggleOffroadItems(val) {
  var show = val === '4x4-offroad';
  document.querySelectorAll('.offroad-only').forEach(function(row) {
    if (show) { row.classList.add('show'); row.querySelectorAll('select').forEach(function(s){ s.setAttribute('required',''); }); }
    else { row.classList.remove('show'); row.querySelectorAll('select').forEach(function(s){ s.removeAttribute('required'); s.selectedIndex=0; }); row.querySelectorAll('input').forEach(function(i){ i.value=''; }); }
  });
}

function initOffroadToggle() {
  document.querySelectorAll('input[name="vehicleSize"]').forEach(function(r) {
    r.addEventListener('change', function(){ toggleOffroadItems(this.value); });
  });
}

// ==============================================
// FORM SUBMISSION
// ==============================================

function initializeFormValidation() {
  var form = document.querySelector('#inspection-tab form');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!selectedVehicleId) { showErrorMessage('Please select a vehicle first!'); return; }

    var fd = new FormData(form);
    var inspName = fd.get('inspName'), inspId = fd.get('inspId');
    var supName = fd.get('supName'), supId = fd.get('supId');
    if (!inspName || !inspId) { showErrorMessage('Please fill in Inspector Name and ID!'); return; }
    if (!supName || !supId) { showErrorMessage('Please fill in Supervisor Name and ID!'); return; }

    var insideChecked = Array.from(fd.getAll('inside[]')).join(',');
    var outsideChecked = Array.from(fd.getAll('outside[]')).join(',');
    var hasAction = false;
    var issues = [];
    fd.forEach(function(v, k) {
      if (v === 'Action Required') { hasAction = true; issues.push(k.replace(/^eq_/,'').replace(/_/g,' ')); }
    });

    var data = {
      vehicleId: selectedVehicleId,
      doorNo: document.getElementById('doorNo').value,
      plateNo: document.getElementById('plateNo').value,
      inspectionDate: new Date().toISOString().split('T')[0],
      inspectorName: inspName, inspectorId: inspId,
      supervisorName: supName, supervisorId: supId,
      overallStatus: hasAction ? 'Action Required' : 'Passed',
      issuesFound: issues.length > 0 ? issues.join(', ') : '0',
      actionRequired: hasAction ? 'True' : 'False',
      vehicle_inside: insideChecked, vehicle_outside: outsideChecked,
      vehicle_observation: fd.get('vehicleObs') || '',
      windshieldWipers_condition: fd.get('eq_wipers')||'', windshieldWipers_observation: fd.get('eq_wipers_note')||'',
      reflectiveTriangles_condition: fd.get('eq_triangles')||'', reflectiveTriangles_observation: fd.get('eq_triangles_note')||'',
      footBrakes_condition: fd.get('eq_footbrakes')||'', footBrakes_observation: fd.get('eq_footbrakes_note')||'',
      emergencyBrakes_condition: fd.get('eq_emergencybrakes')||'', emergencyBrakes_observation: fd.get('eq_emergencybrakes_note')||'',
      horn_condition: fd.get('eq_horn')||'', horn_observation: fd.get('eq_horn_note')||'',
      tireChangingKit_condition: fd.get('eq_jack')||'', tireChangingKit_observation: fd.get('eq_jack_note')||'',
      tires_condition: fd.get('eq_tires')||'', tires_observation: fd.get('eq_tires_note')||'',
      spareTire_condition: fd.get('eq_spare')||'', spareTire_observation: fd.get('eq_spare_note')||'',
      wheels_condition: fd.get('eq_wheels')||'', wheels_observation: fd.get('eq_wheels_note')||'',
      jmFlyer_condition: fd.get('eq_jm_flyer')||'', jmFlyer_observation: fd.get('eq_jm_flyer_note')||'',
      emergencyContactList_condition: fd.get('eq_contact_list')||'', emergencyContactList_observation: fd.get('eq_contact_list_note')||'',
      shovel_condition: fd.get('eq_shovel')||'', shovel_observation: fd.get('eq_shovel_note')||'',
      sandBoards_condition: fd.get('eq_sand_boards')||'', sandBoards_observation: fd.get('eq_sand_boards_note')||'',
      towingCable_condition: fd.get('eq_towing')||'', towingCable_observation: fd.get('eq_towing_note')||'',
      shackles_condition: fd.get('eq_shackles')||'', shackles_observation: fd.get('eq_shackles_note')||'',
      tireGauge_condition: fd.get('eq_tire_gauge')||'', tireGauge_observation: fd.get('eq_tire_gauge_note')||'',
      airCompressor_condition: fd.get('eq_air_compressor')||'', airCompressor_observation: fd.get('eq_air_compressor_note')||'',
      flashlight_condition: fd.get('eq_flash')||'', flashlight_observation: fd.get('eq_flash_note')||'',
      safetyEquipment: ''
    };

    showSuccessMessage('Submitting inspection...');
    var result = await apiPost('/add_inspection', data);
    if (result.success) {
      showSuccessMessage('✅ Inspection submitted successfully!');
      await loadInspectionsData(); await loadAnalyticsData();
      updateDashboard(); updateCarHistory();
      form.reset(); clearInspectionForm();
      document.getElementById('vehicleSelect').value = '';
      setTimeout(function(){ switchToTab('dashboard'); }, 1500);
    } else {
      showErrorMessage('❌ Failed: ' + (result.message || 'Unknown error'));
    }
  });
}

function switchToTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===tabName); });
  document.querySelectorAll('.tab-content').forEach(function(c){ c.classList.toggle('active', c.id===tabName+'-tab'); });
}

// ==============================================
// VEHICLE MANAGEMENT TABLE
// ==============================================

function populateVehicleTable() {
  var tbody = document.getElementById('managementVehicleBody');
  if (!tbody) return;
  if (!vehiclesData.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No vehicles available</td></tr>'; return; }

  tbody.innerHTML = vehiclesData.map(function(v) {
    return '<tr>' +
      '<td>'+(v.doorNo||'-')+'</td>' +
      '<td>'+(v.plateNo||'-')+'</td>' +
      '<td>'+(v.division||'-')+'</td>' +
      '<td>'+(v.vehicleType||'-')+'</td>' +
      '<td>'+(v.vehicleSize||'-')+'</td>' +
      '<td style="white-space:nowrap;">' +
        '<button onclick="openEditModal('+v.id+')" style="padding:5px 14px;border:1px solid #0f766e;color:#0f766e;background:white;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;margin-right:4px;">Update</button>' +
        '<button onclick="deleteVehicle('+v.id+')" style="padding:5px 14px;border:1px solid #ef4444;color:#ef4444;background:white;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Remove</button>' +
      '</td></tr>';
  }).join('');
}

// ==============================================
// EDIT MODAL
// ==============================================

function openEditModal(vehicleId) {
  var v = vehiclesData.find(function(x){ return Number(x.id) === Number(vehicleId); });
  if (!v) return;
  document.getElementById('editVehicleId').value = vehicleId;
  document.getElementById('editDoorNo').value = v.doorNo || '';
  document.getElementById('editPlateNo').value = v.plateNo || '';
  document.getElementById('editDiv').value = v.division || '';
  document.getElementById('editVehicleType').value = v.vehicleType || '';
  document.getElementById('editVehicleSize').value = v.vehicleSize || '4x2';
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

async function saveEditVehicle() {
  var vehicleId = parseInt(document.getElementById('editVehicleId').value);
  var doorNo = document.getElementById('editDoorNo').value.trim();
  var plateNo = document.getElementById('editPlateNo').value.trim();
  if (!doorNo || !plateNo) { showErrorMessage('Please enter door number and plate number'); return; }

  var data = {
    doorNo: doorNo, plateNo: plateNo,
    division: document.getElementById('editDiv').value.trim(),
    vehicleType: document.getElementById('editVehicleType').value.trim(),
    vehicleSize: document.getElementById('editVehicleSize').value
  };

  var result = await apiPut('/update_vehicle/' + vehicleId, data);
  if (result.success) {
    closeEditModal();
    showSuccessMessage('✅ Vehicle updated successfully!');
    await loadVehiclesData(); await loadAnalyticsData();
    refreshAllUI();
  } else {
    showErrorMessage('❌ Error updating vehicle: ' + (result.message || ''));
  }
}

// ==============================================
// ADD & DELETE VEHICLE
// ==============================================

async function addVehicle() {
  var doorNo = document.getElementById('newDoorNo').value.trim();
  var plateNo = document.getElementById('newPlateNo').value.trim();
  var division = document.getElementById('newDiv').value.trim();
  var vehicleType = document.getElementById('newVehicleType').value.trim();
  var vehicleSize = document.getElementById('newVehicleSize').value;

  if (!doorNo || !plateNo) { showErrorMessage('Please enter door number and plate number'); return; }

  var result = await apiPost('/add_vehicle', {
    doorNo: doorNo, plateNo: plateNo,
    division: division || 'General',
    vehicleType: vehicleType || 'N/A',
    vehicleSize: vehicleSize || '4x2'
  });

  if (result.success) {
    showSuccessMessage('✅ Vehicle added successfully!');
    await loadVehiclesData(); await loadAnalyticsData();
    refreshAllUI();
    document.getElementById('newDoorNo').value = '';
    document.getElementById('newPlateNo').value = '';
    document.getElementById('newDiv').value = '';
    document.getElementById('newVehicleType').value = '';
    document.getElementById('newVehicleSize').value = '4x2';
  } else {
    showErrorMessage('❌ Error adding vehicle: ' + (result.message || 'Unknown error'));
  }
}

async function deleteVehicle(vehicleId) {
  var v = vehiclesData.find(function(x){ return Number(x.id) === Number(vehicleId); });
  var label = v ? (v.doorNo + ' - ' + v.plateNo) : vehicleId;
  if (!confirm('Are you sure you want to delete "' + label + '"?\n\nThis action cannot be undone!')) return;

  var result = await apiDelete('/delete_vehicle/' + vehicleId);
  if (result.success) {
    showSuccessMessage('✅ Vehicle deleted successfully!');
    await loadVehiclesData(); await loadInspectionsData(); await loadAnalyticsData();
    refreshAllUI();
  } else {
    showErrorMessage('❌ Error deleting vehicle');
  }
}

// ==============================================
// REFRESH ALL UI
// ==============================================

function refreshAllUI() {
  populateVehicleTable();
  populateVehicleDropdown();
  updateDashboard();
  updateCarHistory();
}

// ==============================================
// TAB NAVIGATION
// ==============================================

function initializeTabs() {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = this.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c){ c.classList.remove('active'); });
      this.classList.add('active');
      var target = document.getElementById(tab + '-tab');
      if (target) target.classList.add('active');
    });
  });
}

// ==============================================
// INIT
// ==============================================

async function initializeApp() {
  console.log('Initializing...');
  if (!await loadVehiclesData()) return;
  await loadInspectionsData();
  await loadAnalyticsData();

  initializeTabs();
  initializeFormValidation();
  initOffroadToggle();

  populateVehicleTable();
  populateVehicleDropdown();
  updateDashboard();
  updateCarHistory();

  // Button listeners
  var addBtn = document.getElementById('addVehicleBtn');
  if (addBtn) addBtn.addEventListener('click', addVehicle);

  var saveBtn = document.getElementById('saveEditBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveEditVehicle);

  // Close modal on overlay click
  var modal = document.getElementById('editModal');
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeEditModal(); });
  
  // Close inspection details modal on overlay click
  var inspModal = document.getElementById('inspectionDetailsModal');
  if (inspModal) inspModal.addEventListener('click', function(e) { if (e.target === inspModal) closeInspectionDetails(); });

  handleVehicleSelection();
  console.log('✅ App initialized');
}

// ==============================================
// INSPECTION DETAILS MODAL
// ==============================================

function viewInspectionDetails(inspectionId) {
  var inspection = inspectionsData.find(function(i) { return i.inspectionId === inspectionId; });
  if (!inspection) return;
  
  // Build equipment list
  var equipmentFields = [
    { key: 'windshieldWipers', label: 'Windshield Wipers' },
    { key: 'reflectiveTriangles', label: 'Reflective Triangles' },
    { key: 'footBrakes', label: 'Foot Brakes' },
    { key: 'emergencyBrakes', label: 'Emergency Brakes' },
    { key: 'horn', label: 'Horn' },
    { key: 'tireChangingKit', label: 'Tire Changing Kit' },
    { key: 'tires', label: 'Tires' },
    { key: 'spareTire', label: 'Spare Tire' },
    { key: 'wheels', label: 'Wheels' },
    { key: 'jmFlyer', label: 'JM "What to Do" Flyer' },
    { key: 'emergencyContactList', label: 'Emergency Contact List' },
    { key: 'shovel', label: 'Two Shovels' },
    { key: 'sandBoards', label: 'Two Sand Boards' },
    { key: 'towingCable', label: 'Towing Cable/Strap' },
    { key: 'shackles', label: 'Two Soft Shackles' },
    { key: 'tireGauge', label: 'Tire Gauge' },
    { key: 'airCompressor', label: '12V Air Compressor' },
    { key: 'flashlight', label: 'Flashlight' }
  ];
  
  var equipmentHTML = '';
  var issuesCount = 0;
  
  equipmentFields.forEach(function(field) {
    var condition = inspection[field.key + '_condition'] || 'N/A';
    var observation = inspection[field.key + '_observation'] || '';
    
    if (condition !== 'N/A' && condition !== '') {
      var statusBadge = condition === 'OK' 
        ? '<span style="background:#00843D;color:white;padding:3px 10px;border-radius:6px;font-size:11px;">✓ OK</span>'
        : '<span style="background:#f59e0b;color:white;padding:3px 10px;border-radius:6px;font-size:11px;">⚠ Action Required</span>';
      
      if (condition === 'Action Required') issuesCount++;
      
      equipmentHTML += '<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>' + field.label + '</strong></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">' + statusBadge + '</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">' + (observation || '-') + '</td></tr>';
    }
  });
  
  var overallBadge = inspection.overallStatus === 'Passed'
    ? '<span style="background:#00843D;color:white;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;">✓ Passed</span>'
    : '<span style="background:#f59e0b;color:white;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;">⚠ Action Required</span>';
  
  var isMobile = window.innerWidth <= 768;
  
  var modalContent = '<div style="max-width:' + (isMobile ? '100%' : '900px') + ';margin:0 auto;background:white;border-radius:' + (isMobile ? '0' : '12px') + ';overflow:hidden;max-height:' + (isMobile ? '100vh' : '90vh') + ';display:flex;flex-direction:column;">' +
    '<div style="background:linear-gradient(135deg, #00843D 0%, #00A3E0 100%);color:white;padding:' + (isMobile ? '16px' : '24px 30px') + ';display:flex;justify-content:space-between;align-items:center;">' +
      '<div>' +
        '<h2 style="margin:0 0 8px 0;font-size:' + (isMobile ? '18px' : '24px') + ';font-weight:700;">Inspection Details</h2>' +
        '<p style="margin:0;opacity:0.9;font-size:' + (isMobile ? '12px' : '14px') + ';">ID: ' + inspection.inspectionId + '</p>' +
      '</div>' +
      '<button onclick="closeInspectionDetails()" style="background:rgba(255,255,255,0.2);border:none;color:white;font-size:' + (isMobile ? '24px' : '28px') + ';cursor:pointer;width:' + (isMobile ? '35px' : '40px') + ';height:' + (isMobile ? '35px' : '40px') + ';border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.2)\'">&times;</button>' +
    '</div>' +
    '<div style="overflow-y:auto;padding:' + (isMobile ? '15px' : '30px') + ';">' +
      // Vehicle Info Section
      '<div style="background:#f8fafc;border-radius:10px;padding:' + (isMobile ? '15px' : '20px') + ';margin-bottom:' + (isMobile ? '15px' : '24px') + ';">' +
        '<h3 style="margin:0 0 ' + (isMobile ? '12px' : '16px') + ' 0;color:#0f172a;font-size:' + (isMobile ? '16px' : '18px') + ';font-weight:700;border-bottom:2px solid #0f766e;padding-bottom:8px;">Vehicle Information</h3>' +
        '<div style="display:grid;grid-template-columns:' + (isMobile ? '1fr' : 'repeat(auto-fit,minmax(200px,1fr))') + ';gap:' + (isMobile ? '12px' : '16px') + ';">' +
          '<div><div style="color:#64748b;font-size:11px;margin-bottom:4px;">Door Number</div><div style="font-weight:600;font-size:' + (isMobile ? '14px' : '16px') + ';">' + (inspection.doorNo || '-') + '</div></div>' +
          '<div><div style="color:#64748b;font-size:11px;margin-bottom:4px;">Plate Number</div><div style="font-weight:600;font-size:' + (isMobile ? '14px' : '16px') + ';">' + (inspection.plateNo || '-') + '</div></div>' +
          '<div><div style="color:#64748b;font-size:11px;margin-bottom:4px;">Inspection Date</div><div style="font-weight:600;font-size:' + (isMobile ? '13px' : '16px') + ';">' + new Date(inspection.inspectionDate).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'}) + '</div></div>' +
          '<div><div style="color:#64748b;font-size:11px;margin-bottom:4px;">Overall Status</div><div style="margin-top:6px;">' + overallBadge + '</div></div>' +
        '</div>' +
      '</div>' +
      
      // Inspector Info Section
      '<div style="background:#f8fafc;border-radius:10px;padding:' + (isMobile ? '15px' : '20px') + ';margin-bottom:' + (isMobile ? '15px' : '24px') + ';">' +
        '<h3 style="margin:0 0 ' + (isMobile ? '12px' : '16px') + ' 0;color:#0f172a;font-size:' + (isMobile ? '16px' : '18px') + ';font-weight:700;border-bottom:2px solid #0f766e;padding-bottom:8px;">Personnel Information</h3>' +
        '<div style="display:grid;grid-template-columns:' + (isMobile ? '1fr' : '1fr 1fr') + ';gap:' + (isMobile ? '12px' : '20px') + ';">' +
          '<div>' +
            '<div style="margin-bottom:8px;"><span style="color:#64748b;font-size:11px;">Inspector:</span> <strong style="font-size:' + (isMobile ? '13px' : '14px') + ';">' + (inspection.inspectorName || '-') + '</strong></div>' +
            '<div style="color:#64748b;font-size:' + (isMobile ? '11px' : '13px') + ';">ID: ' + (inspection.inspectorId || '-') + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="margin-bottom:8px;"><span style="color:#64748b;font-size:11px;">Supervisor:</span> <strong style="font-size:' + (isMobile ? '13px' : '14px') + ';">' + (inspection.supervisorName || '-') + '</strong></div>' +
            '<div style="color:#64748b;font-size:' + (isMobile ? '11px' : '13px') + ';">ID: ' + (inspection.supervisorId || '-') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      
      // Vehicle Condition Section
      '<div style="background:#f8fafc;border-radius:10px;padding:' + (isMobile ? '15px' : '20px') + ';margin-bottom:' + (isMobile ? '15px' : '24px') + ';">' +
        '<h3 style="margin:0 0 ' + (isMobile ? '12px' : '16px') + ' 0;color:#0f172a;font-size:' + (isMobile ? '16px' : '18px') + ';font-weight:700;border-bottom:2px solid #0f766e;padding-bottom:8px;">Vehicle Condition</h3>' +
        '<div style="display:grid;grid-template-columns:' + (isMobile ? '1fr' : '1fr 1fr') + ';gap:' + (isMobile ? '12px' : '16px') + ';">' +
          '<div>' +
            '<div style="color:#64748b;font-size:11px;margin-bottom:6px;">Inside Condition</div>' +
            '<div style="background:white;padding:' + (isMobile ? '10px' : '12px') + ';border-radius:6px;border:1px solid #e2e8f0;font-size:' + (isMobile ? '12px' : '14px') + ';">' + (inspection.vehicle_inside || 'No notes') + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="color:#64748b;font-size:11px;margin-bottom:6px;">Outside Condition</div>' +
            '<div style="background:white;padding:' + (isMobile ? '10px' : '12px') + ';border-radius:6px;border:1px solid #e2e8f0;font-size:' + (isMobile ? '12px' : '14px') + ';">' + (inspection.vehicle_outside || 'No notes') + '</div>' +
          '</div>' +
        '</div>' +
        (inspection.vehicle_observation ? '<div style="margin-top:' + (isMobile ? '12px' : '16px') + ';"><div style="color:#64748b;font-size:11px;margin-bottom:6px;">General Observation</div><div style="background:white;padding:' + (isMobile ? '10px' : '12px') + ';border-radius:6px;border:1px solid #e2e8f0;font-size:' + (isMobile ? '12px' : '14px') + ';">' + inspection.vehicle_observation + '</div></div>' : '') +
      '</div>' +
      
      // Equipment Checklist Section
      '<div style="background:#f8fafc;border-radius:10px;padding:' + (isMobile ? '15px' : '20px') + ';margin-bottom:' + (isMobile ? '15px' : '24px') + ';">' +
        '<h3 style="margin:0 0 ' + (isMobile ? '12px' : '16px') + ' 0;color:#0f172a;font-size:' + (isMobile ? '16px' : '18px') + ';font-weight:700;border-bottom:2px solid #0f766e;padding-bottom:8px;">Equipment Checklist <span style="background:#ef4444;color:white;padding:' + (isMobile ? '3px 8px' : '4px 12px') + ';border-radius:12px;font-size:' + (isMobile ? '10px' : '12px') + ';margin-left:' + (isMobile ? '5px' : '10px') + ';">' + issuesCount + ' Issues</span></h3>' +
        '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">' +
          '<table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;' + (isMobile ? 'font-size:11px;' : '') + '">' +
            '<thead><tr style="background:#f1f5f9;"><th style="padding:' + (isMobile ? '8px 6px' : '12px') + ';text-align:left;color:#475569;font-size:' + (isMobile ? '11px' : '13px') + ';font-weight:600;">Equipment</th><th style="padding:' + (isMobile ? '8px 6px' : '12px') + ';text-align:left;color:#475569;font-size:' + (isMobile ? '11px' : '13px') + ';font-weight:600;">Status</th><th style="padding:' + (isMobile ? '8px 6px' : '12px') + ';text-align:left;color:#475569;font-size:' + (isMobile ? '11px' : '13px') + ';font-weight:600;">Observation</th></tr></thead>' +
            '<tbody>' + equipmentHTML + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      
      // Issues & Actions Section
      (inspection.issuesFound || inspection.actionRequired ? 
        '<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:10px;padding:' + (isMobile ? '15px' : '20px') + ';margin-bottom:' + (isMobile ? '15px' : '24px') + ';">' +
          '<h3 style="margin:0 0 ' + (isMobile ? '12px' : '16px') + ' 0;color:#dc2626;font-size:' + (isMobile ? '16px' : '18px') + ';font-weight:700;">⚠️ Issues & Required Actions</h3>' +
          (inspection.issuesFound ? '<div style="margin-bottom:12px;"><strong style="color:#0f172a;font-size:' + (isMobile ? '13px' : '14px') + ';">Issues Found:</strong><div style="margin-top:6px;color:#475569;line-height:1.6;font-size:' + (isMobile ? '12px' : '14px') + ';">' + inspection.issuesFound + '</div></div>' : '') +
          (inspection.actionRequired ? '<div><strong style="color:#0f172a;font-size:' + (isMobile ? '13px' : '14px') + ';">Action Required:</strong><div style="margin-top:6px;color:#475569;line-height:1.6;font-size:' + (isMobile ? '12px' : '14px') + ';">' + inspection.actionRequired + '</div></div>' : '') +
        '</div>' 
        : '') +
      
    '</div>' +
  '</div>';
  
  document.getElementById('inspectionDetailsContent').innerHTML = modalContent;
  document.getElementById('inspectionDetailsModal').style.display = 'flex';
}

function closeInspectionDetails() {
  document.getElementById('inspectionDetailsModal').style.display = 'none';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// CSS animations
var style = document.createElement('style');
style.textContent = '@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}';
document.head.appendChild(style);
