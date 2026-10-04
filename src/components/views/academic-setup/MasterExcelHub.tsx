import React, { useState, useRef } from 'react';
import { useTimetable } from '../../../context/TimetableContext';
import {
  generateMasterExcelTemplate,
  parseMasterExcelWorkbook,
  ExcelImportPreview
} from '../../../lib/excelMasterService';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Layers,
  Building2,
  GraduationCap,
  BookOpen,
  UserSquare2,
  DoorOpen,
  Users,
  Database,
  ArrowRight,
  Info,
  Check
} from 'lucide-react';

export function MasterExcelHub({ onNavigateToTab }: { onNavigateToTab?: (tab: string) => void }) {
  const {
    departments,
    programs,
    courses,
    facultyMembers,
    rooms,
    sections,
    allocations,
    commitMasterImport,
    runValidation
  } = useTimetable();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [importMode, setImportMode] = useState<'upsert' | 'replace'>('upsert');
  const [commitResult, setCommitResult] = useState<{
    success: boolean;
    importedCount: number;
    message: string;
  } | null>(null);
  const [activeErrorFilter, setActiveErrorFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const [isDragging, setIsDragging] = useState(false);

  // Helper for initiating browser download of an XLSX Blob
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 1. Download Master Template (with current data or defaults)
  const handleDownloadTemplate = (includeCurrentData: boolean) => {
    const blob = generateMasterExcelTemplate(
      includeCurrentData
        ? {
            departments,
            programs,
            courses,
            facultyMembers,
            rooms,
            sections,
            allocations
          }
        : undefined
    );
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = includeCurrentData
      ? `Thapar_Timetable_Current_Database_${timestamp}.xlsx`
      : `Thapar_Timetable_Master_Template_${timestamp}.xlsx`;
    triggerDownload(blob, filename);
  };

  // 2. Handle File Selection and Parsing
  const processFile = async (file: File) => {
    setSelectedFile(file);
    setIsParsing(true);
    setCommitResult(null);

    try {
      const parsedPreview = await parseMasterExcelWorkbook(file, {
        departments,
        programs,
        courses,
        facultyMembers,
        rooms,
        sections
      });
      setPreview(parsedPreview);
    } catch (err: any) {
      setPreview({
        sheetCounts: {
          departments: 0,
          programs: 0,
          courses: 0,
          faculty: 0,
          rooms: 0,
          groups: 0,
          subgroups: 0,
          allocations: 0,
          students: 0
        },
        totalRows: 0,
        validRows: 0,
        warningCount: 0,
        errorCount: 1,
        warnings: [],
        errors: [`Could not parse Excel file: ${err?.message || 'Invalid format'}`],
        parsedData: {
          departments: [],
          programs: [],
          courses: [],
          faculty: [],
          rooms: [],
          groups: [],
          subgroups: [],
          allocations: [],
          students: []
        }
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 3. Commit Master Data
  const handleCommit = () => {
    if (!preview || preview.errorCount > 0) return;
    const result = commitMasterImport(preview.parsedData, importMode);
    setCommitResult(result);
    runValidation();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Introduction */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#8C1B2E]/10 dark:bg-red-500/10 text-[#8C1B2E] dark:text-red-400">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-zinc-100">
                Master Academic Data Setup via Excel
              </h2>
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Standardized, institutional Excel workbook import for departments, degree programs, curriculum courses,
              faculty instructors, physical rooms/labs, student cohort groups/subgroups, and teaching assignments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleDownloadTemplate(false)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300 transition-colors shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-[#8C1B2E] dark:text-red-400" />
              <span>Blank Template (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#8C1B2E] hover:bg-[#731625] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Current Database (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-Step Guided Setup Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step 1 & 2: Upload Zone */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <span className="text-xs font-bold font-serif uppercase tracking-wider text-[#8C1B2E] dark:text-red-400">
                Step 1 & 2 · Upload Workbook
              </span>
              <span className="text-[11px] font-mono text-stone-400">.xlsx / .xls</span>
            </div>

            <div
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-[#8C1B2E] bg-[#8C1B2E]/5 dark:bg-red-950/20'
                  : 'border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-950/50 hover:border-stone-400 dark:hover:border-zinc-700'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="p-3 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                  {selectedFile ? selectedFile.name : 'Click to select or drag & drop'}
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500">
                  Thapar Master Timetable Workbook (.xlsx)
                </p>
              </div>
              {selectedFile && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>

            {/* Quick Rules & Guidelines */}
            <div className="bg-white dark:bg-zinc-950/60 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-3 space-y-2 text-[11px] text-stone-600 dark:text-zinc-400">
              <div className="font-semibold text-stone-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-[#8C1B2E]" />
                <span>Workbook Guidelines</span>
              </div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Uses human-readable codes (e.g. <code>CSED</code>, <code>CS501</code>, <code>CSE-A</code>, <code>A1</code>).</li>
                <li>Do not rename worksheet tabs or header columns in row 1.</li>
                <li>Subgroups automatically associate with their parent group.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 3: Real-Time Preview & Validation Summary */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <div>
                <span className="text-xs font-bold font-serif uppercase tracking-wider text-[#8C1B2E] dark:text-red-400">
                  Step 3 · Verification & Entity Audit
                </span>
                <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                  Automated validation across institutional constraints & referential integrity
                </p>
              </div>

              {preview && (
                <div className="flex items-center gap-2">
                  {preview.errorCount === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ready for Import
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-rose-50 text-rose-800 border border-rose-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                      <XCircle className="h-3.5 w-3.5" /> {preview.errorCount} Blocking Error{preview.errorCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {preview.warningCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5" /> {preview.warningCount} Warning{preview.warningCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {isParsing ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3 text-stone-500">
                <RefreshCw className="h-6 w-6 animate-spin text-[#8C1B2E]" />
                <span className="text-xs font-medium">Validating workbook structure and cross-sheet references...</span>
              </div>
            ) : preview ? (
              <div className="space-y-4">
                {/* 8 Metric Badges for Detected Worksheets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-stone-400" /> Depts
                    </span>
                    <strong className="font-mono text-stone-900 dark:text-zinc-100">{preview.sheetCounts.departments}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-stone-400" /> Programs
                    </span>
                    <strong className="font-mono text-stone-900 dark:text-zinc-100">{preview.sheetCounts.programs}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-stone-400" /> Courses
                    </span>
                    <strong className="font-mono text-stone-900 dark:text-zinc-100">{preview.sheetCounts.courses}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <UserSquare2 className="h-3.5 w-3.5 text-stone-400" /> Faculty
                    </span>
                    <strong className="font-mono text-stone-900 dark:text-zinc-100">{preview.sheetCounts.faculty}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <DoorOpen className="h-3.5 w-3.5 text-stone-400" /> Rooms
                    </span>
                    <strong className="font-mono text-stone-900 dark:text-zinc-100">{preview.sheetCounts.rooms}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-stone-400" /> Groups
                    </span>
                    <strong className="font-mono text-[#8C1B2E] dark:text-red-400">{preview.sheetCounts.groups}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-stone-400" /> Subgroups
                    </span>
                    <strong className="font-mono text-stone-900 dark:text-zinc-100">{preview.sheetCounts.subgroups}</strong>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-stone-400" /> Allocations
                    </span>
                    <strong className="font-mono text-emerald-700 dark:text-emerald-400">{preview.sheetCounts.allocations}</strong>
                  </div>
                </div>

                {/* Audit Logs (Errors & Warnings) */}
                {(preview.errors.length > 0 || preview.warnings.length > 0) && (
                  <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden text-xs">
                    <div className="bg-stone-50 dark:bg-zinc-950/60 p-2.5 border-b border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                      <span className="font-semibold text-stone-700 dark:text-zinc-300">
                        Audit Log ({preview.errors.length + preview.warnings.length} items)
                      </span>
                      <div className="flex gap-1 text-[11px]">
                        <button
                          onClick={() => setActiveErrorFilter('all')}
                          className={`px-2 py-0.5 rounded ${activeErrorFilter === 'all' ? 'bg-[#8C1B2E] text-white font-medium' : 'text-stone-500 hover:text-stone-800'}`}
                        >
                          All ({preview.errors.length + preview.warnings.length})
                        </button>
                        <button
                          onClick={() => setActiveErrorFilter('errors')}
                          className={`px-2 py-0.5 rounded ${activeErrorFilter === 'errors' ? 'bg-rose-700 text-white font-medium' : 'text-stone-500 hover:text-rose-700'}`}
                        >
                          Errors ({preview.errors.length})
                        </button>
                        <button
                          onClick={() => setActiveErrorFilter('warnings')}
                          className={`px-2 py-0.5 rounded ${activeErrorFilter === 'warnings' ? 'bg-amber-600 text-white font-medium' : 'text-stone-500 hover:text-amber-600'}`}
                        >
                          Warnings ({preview.warnings.length})
                        </button>
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-[#E5E2D9] dark:divide-zinc-800/80 p-1">
                      {activeErrorFilter !== 'warnings' &&
                        preview.errors.map((err, i) => (
                          <div key={`err-${i}`} className="p-2 flex items-start gap-2 text-rose-700 dark:text-red-400 font-mono text-[11px]">
                            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{err}</span>
                          </div>
                        ))}

                      {activeErrorFilter !== 'errors' &&
                        preview.warnings.map((warn, i) => (
                          <div key={`warn-${i}`} className="p-2 flex items-start gap-2 text-amber-700 dark:text-amber-400 font-mono text-[11px]">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{warn}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Mode selector and Commit Execution */}
                <div className="pt-2 border-t border-[#E5E2D9] dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-stone-700 dark:text-zinc-300">Synchronization Mode:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'upsert'}
                        onChange={() => setImportMode('upsert')}
                        className="text-[#8C1B2E] focus:ring-[#8C1B2E]"
                      />
                      <span className="text-stone-800 dark:text-zinc-200">Merge / Upsert</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-[#8C1B2E] focus:ring-[#8C1B2E]"
                      />
                      <span className="text-rose-700 dark:text-red-400">Clean Replace</span>
                    </label>
                  </div>

                  <button
                    onClick={handleCommit}
                    disabled={preview.errorCount > 0}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
                      preview.errorCount === 0
                        ? 'bg-[#8C1B2E] hover:bg-[#731625] text-white cursor-pointer'
                        : 'bg-stone-200 text-stone-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <Database className="h-4 w-4" />
                    <span>Apply & Synchronize Master Data</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-stone-400 dark:text-zinc-500 border border-dashed border-[#E5E2D9] dark:border-zinc-800 rounded-xl">
                Upload or drop a Thapar Master Timetable spreadsheet on the left to preview parsed records and check validation.
              </div>
            )}

            {/* Commit Result Banner */}
            {commitResult && (
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in duration-200 ${
                  commitResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300'
                    : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">{commitResult.message}</div>
                    <p className="text-[11px] text-stone-600 dark:text-zinc-400 mt-0.5">
                      All cross-references and cohort groups are now stored in memory. You can inspect Groups & Subgroups or run the generator.
                    </p>
                  </div>
                </div>

                {onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab('generator')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#8C1B2E] text-white rounded-lg text-xs font-medium shrink-0 hover:bg-[#731625] transition-colors"
                  >
                    <span>Go to Generator</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
