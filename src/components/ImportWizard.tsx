import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  Clipboard, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  X, 
  Table, 
  FileSpreadsheet, 
  Download,
  Flame,
  Gauge,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProductionData } from '../lib/stats';

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (newData: ProductionData[], sourceName: string) => void;
  downloadTemplate: () => void;
}

export function ImportWizard({ isOpen, onClose, onImport, downloadTemplate }: ImportWizardProps) {
  const [activeSourceTab, setActiveSourceTab] = useState<'upload' | 'paste'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Column mapping states
  const [mapValue, setMapValue] = useState<string>('');
  const [mapTimestamp, setMapTimestamp] = useState<string>('');
  const [mapTemperature, setMapTemperature] = useState<string>('');
  const [mapPressure, setMapPressure] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Reset helper
  const handleReset = () => {
    setRawText('');
    setParsedRows([]);
    setAvailableColumns([]);
    setFileName('');
    setErrorMsg(null);
    setMapValue('');
    setMapTimestamp('');
    setMapTemperature('');
    setMapPressure('');
  };

  // Process manual/clipboard text (TSV or CSV)
  const processRawText = (text: string) => {
    if (!text.trim()) {
      setErrorMsg("Klistra in någon text först.");
      return;
    }

    try {
      // Auto-detect delimiter: check for Tab (common when copying from Excel) or Comma / Semicolon
      const lines = text.trim().split(/\r?\n/);
      if (lines.length === 0) {
        throw new Error("Inga rader hittades.");
      }

      const firstLine = lines[0];
      let delimiter = '\t';
      if (!firstLine.includes('\t')) {
        if (firstLine.includes(';')) delimiter = ';';
        else if (firstLine.includes(',')) delimiter = ',';
      }

      // Parse columns
      const headers = firstLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());
      
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = lines[i].split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
        const rowObj: any = {};
        headers.forEach((h, idx) => {
          rowObj[h] = cells[idx] || '';
        });
        rows.push(rowObj);
      }

      if (rows.length === 0) {
        throw new Error("Kunde inte tolka några rader under rubriken.");
      }

      setupMappingOptions(headers, rows, "Urklipp");
    } catch (err: any) {
      setErrorMsg(`Kunde inte tolka urklipp. Kontrollera formatet. Detaljer: ${err.message || err}`);
    }
  };

  // Convert Excel Workbook sheets to rows
  const processExcelBuffer = (buffer: ArrayBuffer, name: string) => {
    try {
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (!rawData || rawData.length === 0) {
        throw new Error("Kalkylbladet är tomt eller innehåller ingen giltig data.");
      }

      // Get columns list from first element keys (or search spreadsheet range)
      const headers = Object.keys(rawData[0]);
      setupMappingOptions(headers, rawData, name);
    } catch (err: any) {
      setErrorMsg(`Kunde inte läsa Excel-filen: ${err.message || err}`);
    }
  };

  // Pre-fill smart mappings looking for typical names
  const setupMappingOptions = (headers: string[], rows: any[], sourceName: string) => {
    setFileName(sourceName);
    setAvailableColumns(headers);
    setParsedRows(rows);
    setErrorMsg(null);

    // Smart guessing of mappings
    const valCol = headers.find(h => {
      const l = h.toLowerCase();
      return l === 'värde' || l === 'mätvärde' || l === 'værdi' || l === 'value' || l === 'measurement' || l === 'reading' || l === 'y';
    }) || headers[0] || '';

    const timeCol = headers.find(h => {
      const l = h.toLowerCase();
      return l.includes('tid') || l.includes('datum') || l.includes('time') || l.includes('date') || l.includes('stämpel') || l.includes('klockslag') || l.includes('x');
    }) || '';

    const tempCol = headers.find(h => {
      const l = h.toLowerCase();
      return l.includes('temp') || l.includes('celsius') || l.includes('grad');
    }) || '';

    const pressCol = headers.find(h => {
      const l = h.toLowerCase();
      return l.includes('tryck') || l.includes('press') || l.includes('bar') || l.includes('psi') || l.includes('pa');
    }) || '';

    setMapValue(valCol);
    setMapTimestamp(timeCol);
    setMapTemperature(tempCol);
    setMapPressure(pressCol);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result instanceof ArrayBuffer) {
        processExcelBuffer(evt.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result instanceof ArrayBuffer) {
          processExcelBuffer(evt.target.result, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Perform the import transformation
  const handleSaveImport = () => {
    if (!mapValue) {
      setErrorMsg("Du måste välja vilken kolumn som innehåller själva Mätvärdet.");
      return;
    }

    try {
      const completeData: ProductionData[] = parsedRows.map((row, idx) => {
        // Parse value (required)
        const rawValue = row[mapValue];
        const numValue = Number(String(rawValue).replace(',', '.').replace(/[^\d.-]/g, ''));

        // Handle timestamps
        let finalTimestamp = new Date().toISOString();
        if (mapTimestamp && row[mapTimestamp]) {
          const rawTime = row[mapTimestamp];
          const parsedDate = new Date(rawTime);
          if (!isNaN(parsedDate.getTime())) {
            finalTimestamp = parsedDate.toISOString();
          } else {
            // Fallback generated index-based interval
            finalTimestamp = new Date(Date.now() - (parsedRows.length - idx) * 60000).toISOString();
          }
        } else {
          // Default: Generate historical timeline spacing backward from now
          finalTimestamp = new Date(Date.now() - (parsedRows.length - idx) * 60000).toISOString();
        }

        // Handle temperature (optional)
        let numTemp = 20 + Math.random() * 5; // default range
        if (mapTemperature && row[mapTemperature] !== undefined && row[mapTemperature] !== '') {
          const tVal = Number(String(row[mapTemperature]).replace(',', '.').replace(/[^\d.-]/g, ''));
          if (!isNaN(tVal)) numTemp = tVal;
        }

        // Handle pressure (optional)
        let numPress = 100 + Math.random() * 10; // default range
        if (mapPressure && row[mapPressure] !== undefined && row[mapPressure] !== '') {
          const pVal = Number(String(row[mapPressure]).replace(',', '.').replace(/[^\d.-]/g, ''));
          if (!isNaN(pVal)) numPress = pVal;
        }

        return {
          timestamp: finalTimestamp,
          value: numValue,
          temperature: numTemp,
          pressure: numPress
        };
      }).filter(d => !isNaN(d.value));

      if (completeData.length === 0) {
        throw new Error("Inga rader kunde konverteras till numeriska mätvärden. Kontrollera fältet och försök igen.");
      }

      // Successful import callback
      onImport(completeData, fileName || "Imported Data");
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMsg(`Importfel: ${err.message || err}`);
    }
  };

  // Generate copyable mock data representation
  const handleCopyExample = () => {
    const tsvData = "Tidpunkt\tMätvärde\tTemperatur\tTryck\n" +
      `${new Date(Date.now() - 3600000).toLocaleString('sv-SE')}\t10.45\t21.3\t101.8\n` +
      `${new Date(Date.now() - 1800000).toLocaleString('sv-SE')}\t9.92\t22.6\t103.1\n` +
      `${new Date().toLocaleString('sv-SE')}\t10.12\t21.9\t102.5`;
    
    navigator.clipboard.writeText(tsvData);
    alert("Exempeldata har kopierats till urklipp! Klistra in det i fältet nedan.");
  };

  // Live preview of mapped rows
  const getMappedPreview = () => {
    return parsedRows.slice(0, 3).map((row, idx) => {
      const rawVal = row[mapValue] ?? 'N/A';
      const parsedVal = Number(String(rawVal).replace(',', '.').replace(/[^\d.-]/g, ''));
      
      const rawTime = mapTimestamp ? (row[mapTimestamp] ?? '') : '';
      const rawTemp = mapTemperature ? (row[mapTemperature] ?? '') : '';
      const rawPress = mapPressure ? (row[mapPressure] ?? '') : '';

      return {
        originalIndex: idx + 1,
        time: rawTime || `(Autogenererad #${idx + 1})`,
        value: isNaN(parsedVal) ? `${rawVal} ⚠️ (Ogiltigt tal)` : parsedVal.toFixed(3),
        temp: rawTemp ? String(rawTemp) : '(Autogenererad 20-25)',
        press: rawPress ? String(rawPress) : '(Autogenererad 100-110)'
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-200">
      <Card className="w-full max-w-3xl bg-card border-border shadow-2xl p-0 overflow-hidden relative flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 items-center justify-center flex bg-primary/10 rounded-lg text-primary">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Guidat Importverktyg (Excel / CSV)</h2>
              <p className="text-xs text-muted-foreground">Slipp krångliga formatkrav — anpassa kalkylbladets kolumner fritt</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Ett problem uppstod</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {parsedRows.length === 0 ? (
            /* Tab 1: Load file/data source */
            <div className="space-y-4">
              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveSourceTab('upload')}
                  className={`py-2 px-4 text-xs font-bold border-b-2 transition-all ${
                    activeSourceTab === 'upload' 
                      ? 'border-primary text-primary' 
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5" />
                  Excel eller CSV-fil
                </button>
                <button
                  onClick={() => setActiveSourceTab('paste')}
                  className={`py-2 px-4 text-xs font-bold border-b-2 transition-all ${
                    activeSourceTab === 'paste' 
                      ? 'border-primary text-primary' 
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  <Clipboard className="w-3.5 h-3.5 inline mr-1.5" />
                  Klistra in rådata
                </button>
              </div>

              {activeSourceTab === 'upload' ? (
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`p-10 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all ${
                    dragActive 
                      ? 'border-primary bg-primary/5 scale-[0.99]' 
                      : 'border-border bg-muted/20 hover:bg-muted/30'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-foreground">Dra hit din Excel-fil, eller bläddra</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Stöder .xlsx, .xls, .csv filer</p>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    accept=".xlsx, .xls, .csv" 
                    className="hidden" 
                  />
                  <div className="flex gap-2">
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Välj fil...
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={downloadTemplate}
                      className="gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Ladda ner kalkylmall
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground">Klistra in tabellrader direkt från Excel / Calc:</label>
                    <button 
                      onClick={handleCopyExample}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      Kopiera exempeldata
                    </button>
                  </div>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Tidpunkt&#9;Mätvärde&#9;Temperatur&#9;Tryck&#10;2026-06-06 20:00&#9;10.5&#9;22.4&#9;102.1"
                    rows={8}
                    className="w-full text-xs font-mono p-3 bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                  />
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setRawText('')}
                    >
                      Rensa
                    </Button>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => processRawText(rawText)}
                    >
                      Bekräfta data
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Format explanation */}
              <div className="p-4 bg-muted/25 rounded-2xl border border-border flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-foreground">Hur fungerar det?</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Kalkylbladsfiler kan ha vilka rubriknamn som helst. Efter att du valt en fil eller klistrat in rader, kommer du få välja exakt vilka spalter i ditt dokument som motsvarar mätvärdena och tidpunkterna. Vi autodetekterar de flesta rubriker automatiskt!
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Tab 2: Column mapping step */
            <div className="space-y-6">
              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-bold text-foreground">Framgångsrikt inläst:</span>
                  <span className="font-medium text-muted-foreground shrink-0 max-w-[200px] truncate">"{fileName}" ({parsedRows.length} rader)</span>
                </div>
                <button 
                  onClick={handleReset}
                  className="text-primary font-bold hover:underline"
                >
                  Ändra fil / Klistra om
                </button>
              </div>

              {/* Mapper Fields */}
              <div className="bg-muted/15 border border-border rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
                  <Layers className="w-3.5 h-3.5" />
                  Koppla dina kalkylkolumner till systemfält
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Required Match Value */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      Mätvärde:
                    </label>
                    <select
                      value={mapValue}
                      onChange={(e) => setMapValue(e.target.value)}
                      className="w-full text-xs p-2.5 bg-card border border-border rounded-xl focus:outline-hidden"
                    >
                      <option value="">-- Välj kolumn --</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground leading-normal">Kopplat till processens huvudsakliga analysmätning. Måste vara siffror.</p>
                  </div>

                  {/* Date Column */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-500" />
                      Tidsstämpel / Datum:
                    </label>
                    <select
                      value={mapTimestamp}
                      onChange={(e) => setMapTimestamp(e.target.value)}
                      className="w-full text-xs p-2.5 bg-card border border-border rounded-xl focus:outline-hidden"
                    >
                      <option value="">Generera automatiskt i följd (minutvis)</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground leading-normal">Kopplat till tidpunkten för mätningen. Genereras annars retroaktivt bakåt från nu.</p>
                  </div>

                  {/* Temperature Column */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                      Yttre Temperatur (valfritt):
                    </label>
                    <select
                      value={mapTemperature}
                      onChange={(e) => setMapTemperature(e.target.value)}
                      className="w-full text-xs p-2.5 bg-card border border-border rounded-xl focus:outline-hidden"
                    >
                      <option value="">Autogenerera referensvärden (~20-25°C)</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground leading-normal">Omgivande eller maskintemperatur i processen.</p>
                  </div>

                  {/* Pressure Column */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-purple-500" />
                      Yttre Process-Tryck (valfritt):
                    </label>
                    <select
                      value={mapPressure}
                      onChange={(e) => setMapPressure(e.target.value)}
                      className="w-full text-xs p-2.5 bg-card border border-border rounded-xl focus:outline-hidden"
                    >
                      <option value="">Autogenerera referensvärden (~100-110 bar)</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground leading-normal">Kringliggande tryckmätning i produktionsverktyget.</p>
                  </div>
                </div>
              </div>

              {/* Real-time Mapped Preview Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Table className="w-4 h-4 text-primary" />
                  Förhandsvisning av tolkad data (första 3 raderna)
                </h4>
                <div className="border border-border rounded-xl overflow-hidden shadow-xs bg-card">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <th className="py-2 px-3 text-[10px] uppercase font-bold tracking-wider">Originalrad</th>
                        <th className="py-2 px-3 text-[10px] uppercase font-bold tracking-wider">Kopplad Tid</th>
                        <th className="py-2 px-3 text-[10px] uppercase font-bold tracking-wider">Mätvärde</th>
                        <th className="py-2 px-3 text-[10px] uppercase font-bold tracking-wider">Temp (°C)</th>
                        <th className="py-2 px-3 text-[10px] uppercase font-bold tracking-wider">Tryck (bar)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {getMappedPreview().map((p, idx) => (
                        <tr key={idx} className="hover:bg-muted/15 font-mono">
                          <td className="py-2 px-3 text-muted-foreground font-sans"># {p.originalIndex}</td>
                          <td className="py-2 px-3 truncate max-w-[150px]">{p.time}</td>
                          <td className="py-2 px-3 font-semibold text-foreground">{p.value}</td>
                          <td className="py-2 px-3 text-muted-foreground">{p.temp}</td>
                          <td className="py-2 px-3 text-muted-foreground">{p.press}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">Analysdiagrammen kommer uppdateras direkt med totalt {parsedRows.length} mätpunkter efter import.</p>
              </div>

              {/* Submit panel */}
              <div className="flex justify-end gap-2.5 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleReset}
                >
                  Avbryt & backa
                </Button>
                <Button 
                  variant="primary" 
                  size="sm" 
                  disabled={!mapValue}
                  onClick={handleSaveImport}
                >
                  Kör Import ({parsedRows.length} punkter)
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
