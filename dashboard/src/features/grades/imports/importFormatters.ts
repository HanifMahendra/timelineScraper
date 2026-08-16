import type {
  ImportDraftStatus,
  ImportValidationStatus,
  ImportWarning,
} from './importTypes';

const ERROR_MESSAGES: Record<string, string> = {
  IMPORT_FILE_REQUIRED: 'Pilih satu file CSV atau XLSX.',
  IMPORT_FILE_TOO_LARGE: 'File melebihi batas 5 MB.',
  IMPORT_UNSUPPORTED_TYPE: 'Hanya file CSV dan XLSX yang dapat diimpor.',
  IMPORT_INVALID_CSV: 'Struktur CSV tidak valid.',
  IMPORT_INVALID_XLSX: 'Workbook XLSX tidak valid.',
  IMPORT_ENCRYPTED_WORKBOOK: 'Workbook terenkripsi tidak didukung.',
  IMPORT_MACRO_WORKBOOK_REJECTED: 'Workbook dengan macro ditolak.',
  IMPORT_TOO_MANY_ROWS: 'Jumlah baris melewati batas import.',
  IMPORT_TOO_MANY_COLUMNS: 'Jumlah kolom melewati batas import.',
  IMPORT_TOO_MANY_SHEETS: 'Jumlah sheet melewati batas import.',
  IMPORT_CELL_TOO_LARGE: 'Salah satu cell terlalu panjang.',
  IMPORT_MAPPING_REQUIRED: 'Lengkapi mapping Component Name.',
  IMPORT_MAPPING_AMBIGUOUS: 'Mapping kolom ambigu dan harus diperbaiki.',
  IMPORT_DRAFT_EXPIRED: 'Draft import sudah kedaluwarsa.',
  IMPORT_DRAFT_VERSION_CONFLICT:
    'Draft berubah. Muat ulang sebelum melakukan commit.',
  IMPORT_VALIDATION_FAILED:
    'Masih ada data invalid atau konflik yang belum diselesaikan.',
  IMPORT_COMMIT_TOO_LARGE: 'Import terlalu besar untuk satu commit aman.',
  IMPORT_COMMIT_PARTIAL_FAILURE:
    'Commit gagal dan draft ditahan untuk recovery aman.',
};

export function friendlyImportError(code: string | undefined, fallback: string) {
  return (code && ERROR_MESSAGES[code]) || fallback;
}

export function warningLabel(warning: ImportWarning): string {
  const labels: Record<string, string> = {
    AMBIGUOUS_COLUMN_MAPPING: 'Mapping kolom ambigu',
    MISSING_COMPONENT_NAME: 'Nama komponen kosong',
    UNKNOWN_COMPONENT_TYPE: 'Jenis komponen tidak dikenali',
    UNKNOWN_WEIGHT: 'Bobot belum diketahui',
    ZERO_WEIGHT: 'Bobot bernilai nol',
    AMBIGUOUS_PERCENTAGE: 'Persentase ambigu',
    AMBIGUOUS_DATE: 'Format tanggal ambigu',
    INVALID_DATE: 'Tanggal tidak valid',
    INVALID_NUMBER: 'Angka tidak valid',
    UNKNOWN_BOOLEAN: 'Nilai ya/tidak tidak dikenali',
    UNKNOWN_SCORE_STATUS: 'Status nilai tidak dikenali',
    UNKNOWN_AGGREGATION: 'Mode agregasi tidak dikenali',
    KNOWN_SCORE_MISSING: 'Status known membutuhkan nilai',
    FORMULA_CELL: 'Cell berasal dari formula dan tidak dieksekusi',
    EXTERNAL_FORMULA_REFERENCE:
      'Cached value dari formula eksternal diabaikan',
    DUPLICATE_COMPONENT_NAME: 'Nama komponen duplicate dalam file',
    POSSIBLE_EXISTING_COMPONENT_MATCH: 'Kemungkinan sudah ada di gradebook',
    TOTAL_WEIGHT_BELOW_100: 'Total bobot di bawah 100',
    TOTAL_WEIGHT_ABOVE_100: 'Total bobot di atas 100',
    IMPORT_COMMIT_TOO_LARGE: 'Jumlah entity melebihi batas commit aman',
    GRADE_VALIDATION_ERROR:
      warning.message || 'Candidate tidak lolos validasi nilai',
  };
  return labels[warning.code] || warning.code.replaceAll('_', ' ');
}

export function importStatusLabel(status: ImportDraftStatus) {
  const labels: Record<ImportDraftStatus, string> = {
    parsing: 'Memproses',
    needs_mapping: 'Perlu mapping',
    ready_for_review: 'Siap direview',
    validation_failed: 'Perlu perbaikan',
    committing: 'Menyimpan',
    committed: 'Selesai',
    commit_failed: 'Commit gagal',
    cancelled: 'Dibatalkan',
    expired: 'Kedaluwarsa',
  };
  return labels[status];
}

export function validationStatusLabel(status: ImportValidationStatus) {
  return {
    valid: 'Valid',
    warning: 'Warning',
    invalid: 'Invalid',
  }[status];
}
