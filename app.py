from flask import Flask, request, jsonify, render_template
import pandas as pd
from datetime import datetime
import os
from threading import Lock

try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

app = Flask(__name__)
if HAS_CORS:
    CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_FILE = os.path.join(BASE_DIR, 'vehicle_inspection_database.xlsx')
excel_lock = Lock()

VEHICLE_COLUMNS = [
    'id', 'doorNo', 'plateNo', 'division', 'unit', 'vehicleType', 'vehicleSize',
    'odometer', 'inspectionStickerMileage', 'inspectionStickerDate',
    'restrictedAreaSticker', 'stickerExpiryDate', 'assignedTo', 'assignedDate', 'status'
]

INSPECTION_COLUMNS = [
    'inspectionId', 'vehicleId', 'doorNo', 'plateNo', 'inspectionDate',
    'inspectorName', 'inspectorId', 'supervisorName', 'supervisorId',
    'overallStatus', 'issuesFound', 'actionRequired',
    'vehicle_inside', 'vehicle_outside', 'vehicle_observation',
    'windshieldWipers_condition', 'windshieldWipers_observation',
    'reflectiveTriangles_condition', 'reflectiveTriangles_observation',
    'footBrakes_condition', 'footBrakes_observation',
    'emergencyBrakes_condition', 'emergencyBrakes_observation',
    'horn_condition', 'horn_observation',
    'tireChangingKit_condition', 'tireChangingKit_observation',
    'tires_condition', 'tires_observation',
    'spareTire_condition', 'spareTire_observation',
    'wheels_condition', 'wheels_observation',
    'jmFlyer_condition', 'jmFlyer_observation',
    'emergencyContactList_condition', 'emergencyContactList_observation',
    'shovel_condition', 'shovel_observation',
    'sandBoards_condition', 'sandBoards_observation',
    'towingCable_condition', 'towingCable_observation',
    'shackles_condition', 'shackles_observation',
    'tireGauge_condition', 'tireGauge_observation',
    'airCompressor_condition', 'airCompressor_observation',
    'flashlight_condition', 'flashlight_observation',
    'safetyEquipment'
]


def init_excel_file():
    if not os.path.exists(EXCEL_FILE):
        df_v = pd.DataFrame(columns=VEHICLE_COLUMNS)
        df_i = pd.DataFrame(columns=INSPECTION_COLUMNS)
        with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl') as writer:
            df_v.to_excel(writer, sheet_name='Vehicles', index=False)
            df_i.to_excel(writer, sheet_name='Inspections', index=False)


def read_excel_safe(sheet_name):
    try:
        return pd.read_excel(EXCEL_FILE, sheet_name=sheet_name).fillna('')
    except Exception as e:
        print(f"Read error for {sheet_name}: {e}")
        return pd.DataFrame()


def write_excel_safe(vehicles_df=None, inspections_df=None):
    with excel_lock:
        for i in range(3):
            try:
                if vehicles_df is None:
                    vehicles_df = pd.read_excel(EXCEL_FILE, sheet_name='Vehicles').fillna('')
                if inspections_df is None:
                    inspections_df = pd.read_excel(EXCEL_FILE, sheet_name='Inspections').fillna('')
                with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl', mode='w') as writer:
                    vehicles_df.fillna('').to_excel(writer, sheet_name='Vehicles', index=False)
                    inspections_df.fillna('').to_excel(writer, sheet_name='Inspections', index=False)
                print("SAVED")
                return True
            except PermissionError:
                if i < 2:
                    import time; time.sleep(0.2)
            except Exception as e:
                print(f"Error writing excel: {e}")
                import traceback; traceback.print_exc()
                return False
        print("EXCEL IS OPEN!")
        return False


def safe_str(val):
    if pd.isna(val) or val is None:
        return ''
    return str(val)


def safe_int(val, default=0):
    try:
        if pd.isna(val) or val == '':
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


def get_next_vehicle_id(df):
    if len(df) == 0:
        return 1
    try:
        return int(df['id'].apply(lambda x: safe_int(x, 0)).max()) + 1
    except Exception:
        return 1


def get_next_inspection_id(df):
    year = datetime.now().year
    if len(df) == 0:
        return f"INS-{year}-001"
    max_num = 0
    for val in df['inspectionId']:
        s = str(val)
        if s.startswith('INS-'):
            try:
                num = int(s.split('-')[-1])
                if num > max_num: max_num = num
            except: pass
        else:
            try:
                num = int(float(s))
                if num > max_num: max_num = num
            except: pass
    return f"INS-{year}-{max_num + 1:03d}"


def ensure_columns(df, columns):
    for col in columns:
        if col not in df.columns:
            df[col] = ''
    return df


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/get_vehicles', methods=['GET'])
def get_vehicles():
    try:
        df = ensure_columns(read_excel_safe('Vehicles'), VEHICLE_COLUMNS)
        return jsonify([{
            'id': safe_int(r.get('id', 0)),
            **{col: safe_str(r.get(col, '')) for col in VEHICLE_COLUMNS if col != 'id'}
        } for _, r in df.iterrows()])
    except Exception as e:
        print(f"Error getting vehicles: {e}")
        return jsonify([])


@app.route('/get_inspections', methods=['GET'])
def get_inspections():
    try:
        df = ensure_columns(read_excel_safe('Inspections'), INSPECTION_COLUMNS)
        result = []
        for _, r in df.iterrows():
            insp = {col: safe_str(r.get(col, '')) for col in INSPECTION_COLUMNS}
            insp['vehicleId'] = safe_int(r.get('vehicleId', 0))
            result.append(insp)
        return jsonify(result)
    except Exception as e:
        print(f"Error getting inspections: {e}")
        return jsonify([])


@app.route('/get_analytics', methods=['GET'])
def get_analytics():
    try:
        df_v = ensure_columns(read_excel_safe('Vehicles'), VEHICLE_COLUMNS)
        df_i = ensure_columns(read_excel_safe('Inspections'), INSPECTION_COLUMNS)
        total_v = len(df_v)
        total_i = len(df_i)
        
        # Get all vehicle IDs from Vehicles table
        all_vehicle_ids = set()
        if len(df_v) > 0:
            for vid in df_v['id']:
                vid_int = safe_int(vid, -1)
                if vid_int > 0:
                    all_vehicle_ids.add(vid_int)
        
        # Calculate status based on LAST inspection for each vehicle
        passed_vehicles = set()
        action_vehicles = set()
        
        if len(df_i) > 0:
            # Convert inspectionDate to datetime for sorting
            df_i['inspectionDate_dt'] = pd.to_datetime(df_i['inspectionDate'], errors='coerce')
            # Sort by date descending
            df_i_sorted = df_i.sort_values('inspectionDate_dt', ascending=False)
            
            # Get the last inspection for each vehicle
            for vehicle_id in df_i_sorted['vehicleId'].unique():
                vid = safe_int(vehicle_id, -1)
                if vid <= 0:
                    continue
                vehicle_inspections = df_i_sorted[df_i_sorted['vehicleId'] == vehicle_id]
                if len(vehicle_inspections) > 0:
                    last_status = vehicle_inspections.iloc[0]['overallStatus']
                    if last_status == 'Passed':
                        passed_vehicles.add(vid)
                    elif last_status == 'Action Required':
                        action_vehicles.add(vid)
        
        passed = len(passed_vehicles)
        action = len(action_vehicles)
        inspected_vehicles = passed_vehicles | action_vehicles
        not_inspected = len(all_vehicle_ids - inspected_vehicles)

        monthly = {}
        if len(df_i) > 0:
            try:
                dates = pd.to_datetime(df_i['inspectionDate'], errors='coerce')
                for d in dates.dropna():
                    key = d.strftime('%Y-%m')
                    monthly[key] = monthly.get(key, 0) + 1
            except: pass

        div_data = df_v['division'].value_counts().to_dict() if len(df_v) > 0 else {}
        div_data.pop('', None)
        type_data = df_v['vehicleType'].value_counts().to_dict() if len(df_v) > 0 else {}
        type_data.pop('', None)

        return jsonify({
            'totalVehicles': total_v, 'totalInspections': total_i,
            'passedInspections': passed, 'actionRequiredInspections': action,
            'totalVehiclesInspected': len(inspected_vehicles),
            'totalVehiclesNotInspected': not_inspected,
            'divisionData': div_data,
            'inspectionStatus': {'Passed': passed, 'Action Required': action, 'Not Inspected': not_inspected},
            'monthlyInspections': monthly, 'vehicleTypeData': type_data
        })
    except Exception as e:
        print(f"Error analytics: {e}")
        import traceback; traceback.print_exc()
        return jsonify({})


@app.route('/add_vehicle', methods=['POST'])
def add_vehicle():
    try:
        data = request.json
        print(f"ADD VEHICLE: {data}")
        df = ensure_columns(read_excel_safe('Vehicles'), VEHICLE_COLUMNS)
        new_id = get_next_vehicle_id(df)

        # Convert ALL columns to string type before concat to avoid dtype conflicts
        for col in df.columns:
            if col != 'id':
                df[col] = df[col].astype(str)

        new_row = pd.DataFrame([{
            col: (new_id if col == 'id' else str(data.get(col, '')))
            for col in VEHICLE_COLUMNS
        }])

        df = pd.concat([df, new_row], ignore_index=True)

        if write_excel_safe(vehicles_df=df):
            return jsonify({"success": True, "vehicleId": int(new_id)})
        return jsonify({"success": False, "message": "CLOSE EXCEL"}), 500
    except Exception as e:
        print(f"ADD VEHICLE ERROR: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/update_vehicle/<int:vehicle_id>', methods=['PUT'])
def update_vehicle(vehicle_id):
    try:
        data = request.json
        df = ensure_columns(read_excel_safe('Vehicles'), VEHICLE_COLUMNS)
        df['id'] = df['id'].apply(lambda x: safe_int(x, -1))

        if vehicle_id not in df['id'].values:
            return jsonify({"success": False, "message": "Not found"}), 404

        idx = df[df['id'] == vehicle_id].index[0]
        for field in [c for c in VEHICLE_COLUMNS if c != 'id']:
            if field in data:
                df.at[idx, field] = str(data[field])
        
        # Convert ALL columns to string type before saving to avoid dtype conflicts
        for col in df.columns:
            if col != 'id':
                df[col] = df[col].astype(str)

        if write_excel_safe(vehicles_df=df):
            return jsonify({"success": True})
        return jsonify({"success": False, "message": "CLOSE EXCEL"}), 500
    except Exception as e:
        print(f"UPDATE ERROR: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/delete_vehicle/<int:vehicle_id>', methods=['DELETE'])
def delete_vehicle(vehicle_id):
    try:
        df_v = read_excel_safe('Vehicles')
        df_i = read_excel_safe('Inspections')
        df_v['id'] = df_v['id'].apply(lambda x: safe_int(x, -1))
        df_v = df_v[df_v['id'] != vehicle_id]
        if 'vehicleId' in df_i.columns and len(df_i) > 0:
            df_i['vehicleId'] = df_i['vehicleId'].apply(lambda x: safe_int(x, -1))
            df_i = df_i[df_i['vehicleId'] != vehicle_id]
        if write_excel_safe(vehicles_df=df_v, inspections_df=df_i):
            return jsonify({"success": True})
        return jsonify({"success": False, "message": "CLOSE EXCEL"}), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/add_inspection', methods=['POST'])
def add_inspection():
    try:
        data = request.json
        if not data.get('vehicleId'):
            return jsonify({"success": False, "message": "No vehicle"}), 400
        if not data.get('inspectorName') or not data.get('inspectorId'):
            return jsonify({"success": False, "message": "No inspector"}), 400
        if not data.get('supervisorName') or not data.get('supervisorId'):
            return jsonify({"success": False, "message": "No supervisor"}), 400

        df = ensure_columns(read_excel_safe('Inspections'), INSPECTION_COLUMNS)
        new_id = get_next_inspection_id(df)

        new_row_data = {}
        for col in INSPECTION_COLUMNS:
            if col == 'inspectionId':
                new_row_data[col] = new_id
            elif col == 'vehicleId':
                new_row_data[col] = int(data.get('vehicleId', 0))
            elif col == 'inspectionDate':
                new_row_data[col] = str(data.get('inspectionDate', datetime.now().strftime('%Y-%m-%d')))
            else:
                new_row_data[col] = str(data.get(col, ''))

        df = pd.concat([df, pd.DataFrame([new_row_data])], ignore_index=True)

        if write_excel_safe(inspections_df=df):
            return jsonify({"success": True, "inspectionId": new_id})
        return jsonify({"success": False, "message": "CLOSE EXCEL"}), 500
    except Exception as e:
        print(f"INSPECTION ERROR: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500


if __name__ == '__main__':
    print("=" * 70)
    print("Vehicle Inspection System")
    print("=" * 70)
    init_excel_file()
    print(f"Excel: {EXCEL_FILE}")
    print("URL: http://localhost:5000")
    print("=" * 70)
    app.run(host='0.0.0.0', port=5000, debug=True)
