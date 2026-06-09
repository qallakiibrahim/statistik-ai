import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ReferenceLine, BarChart, Bar, Cell, ComposedChart, Area, ReferenceArea
} from 'recharts';

const ReferenceAreaAny = ReferenceArea as any;

import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  Settings, 
  Brain, 
  RefreshCw,
  FileText,
  BarChart3,
  MessageSquare,
  Play,
  Pause,
  Upload,
  Download,
  Sun,
  Moon,
  Menu,
  X,
  Search,
  BookOpen,
  Info,
  CheckCircle2,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import Markdown from 'react-markdown';
import { cn } from '@/src/lib/utils';
import { generateSampleData, calculateStats, StatsResult, ProductionData, generateSinglePoint, detectAnomalies, Anomaly } from '@/src/lib/stats';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ImportWizard } from '@/src/components/ImportWizard';

import { auth, signInWithGoogle, logout, db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [data, setData] = useState<ProductionData[]>([]);
  const [usl, setUsl] = useState(11.5);
  const [lsl, setLsl] = useState(8.5);
  const [uslLabel, setUslLabel] = useState('USL');
  const [lslLabel, setLslLabel] = useState('LSL');
  const [showSettings, setShowSettings] = useState(false);
  const [showTrendSettings, setShowTrendSettings] = useState(false);
  const [showDistSettings, setShowDistSettings] = useState(false);
  const [trendWindowSize, setTrendWindowSize] = useState(20);
  const [distBins, setDistBins] = useState(8);
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSopOpen, setIsSopOpen] = useState(false);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'history'>('dashboard');
  const [isStreaming, setIsStreaming] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);
  
  // New Visualization States
  const [selectedMetric, setSelectedMetric] = useState<string>('value');
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('line');
  const [showStatsBands, setShowStatsBands] = useState(false);
  const [showMovingAverage, setShowMovingAverage] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [showXAxis, setShowXAxis] = useState(true);
  const [showYAxis, setShowYAxis] = useState(true);
  const [xAxisLabel, setXAxisLabel] = useState('Tid');
  const [yAxisLabel, setYAxisLabel] = useState('Värde');
  
  // Trend Chart Settings
  const [showTrendXAxis, setShowTrendXAxis] = useState(true);
  const [showTrendYAxis, setShowYAxisTrend] = useState(true);
  const [trendXAxisLabel, setTrendXAxisLabel] = useState('Tid');
  const [trendYAxisLabel, setTrendYAxisLabel] = useState('Kapacitet');

  // Distribution Chart Settings
  const [showDistXAxis, setShowDistXAxis] = useState(true);
  const [showDistYAxis, setShowDistYAxis] = useState(false);
  const [distXAxisLabel, setDistXAxisLabel] = useState('Värde');
  const [distYAxisLabel, setDistYAxisLabel] = useState('Antal');
  
  // Zoom States
  const [left, setLeft] = useState<string | number>('dataMin');
  const [right, setRight] = useState<string | number>('dataMax');
  const [refAreaLeft, setRefAreaLeft] = useState<string | number>('');
  const [refAreaRight, setRefAreaRight] = useState<string | number>('');
  const [top, setTop] = useState<string | number>('auto');
  const [bottom, setBottom] = useState<string | number>('auto');

  // Trend Zoom States
  const [trendLeft, setTrendLeft] = useState<string | number>('dataMin');
  const [trendRight, setTrendRight] = useState<string | number>('dataMax');
  const [trendRefAreaLeft, setTrendRefAreaLeft] = useState<string | number>('');
  const [trendRefAreaRight, setTrendRefAreaRight] = useState<string | number>('');
  const [trendTop, setTrendTop] = useState<string | number>('auto');
  const [trendBottom, setTrendBottom] = useState<string | number>('auto');

  // Cp/Cpk Trend States
  const [statsHistory, setStatsHistory] = useState<{timestamp: string, cp: number, cpk: number}[]>([]);
  const [selectedStatsMetric, setSelectedStatsMetric] = useState<'cp' | 'cpk'>('cpk');
  
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/production-data');
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        setData(generateSampleData());
      }
    };
    
    fetchData();
    
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (data.length > 0) {
      const values = data.map(d => Number(d[selectedMetric] || 0));
      const currentStats = calculateStats(values, usl, lsl);
      setStats(currentStats);

      // Detect anomalies
      const detectedAnomalies = detectAnomalies(data, selectedMetric, usl, lsl);
      setAnomalies(detectedAnomalies);

      // Update stats history for trend chart (rolling window)
      const windowSize = trendWindowSize;
      if (data.length >= windowSize) {
        const history = [];
        for (let i = windowSize; i <= data.length; i++) {
          const windowValues = data.slice(Math.max(0, i - windowSize), i).map(d => Number(d[selectedMetric] || 0));
          const s = calculateStats(windowValues, usl, lsl);
          history.push({
            timestamp: data[i-1].timestamp,
            cp: s.cp,
            cpk: s.cpk
          });
        }
        setStatsHistory(history);
      } else {
        setStatsHistory([]);
      }
    }
  }, [data, usl, lsl, selectedMetric, trendWindowSize]);

  const getChartData = () => {
    return data.map((d, i) => {
      const windowSize = 5;
      const start = Math.max(0, i - windowSize + 1);
      const subset = data.slice(start, i + 1).map(p => Number(p[selectedMetric] || 0));
      const avg = subset.reduce((a, b) => a + b, 0) / subset.length;
      
      // Check if this point is an anomaly
      const pointAnomaly = anomalies.find(a => a.timestamp === d.timestamp);
      
      return {
        ...d,
        movingAverage: showMovingAverage ? avg : null,
        upperBand: showStatsBands && stats ? stats.ucl : null,
        lowerBand: showStatsBands && stats ? stats.lcl : null,
        anomalyValue: pointAnomaly ? d[selectedMetric] : null,
        anomalyType: pointAnomaly ? pointAnomaly.type : null,
        testNumber: pointAnomaly ? pointAnomaly.id.split('-')[0].replace('we', '').replace('oos', 'OOS') : null
      };
    });
  };

  useEffect(() => {
    if (isStreaming) {
      streamIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch('/api/latest-point');
          const nextPoint = await response.json();
          setData(prev => [...prev, nextPoint].slice(-100));
        } catch (error) {
          console.error("Failed to fetch latest point:", error);
          setData(prev => [...prev, generateSinglePoint()].slice(-100));
        }
      }, 2000);
    } else {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    }

    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [isStreaming]);

  const handleRefresh = () => {
    setData(generateSampleData());
    setAiAnalysis(null);
    setFileName(null);
    setIsStreaming(false);
  };

  const handleImportedData = (newData: ProductionData[], sourceName: string) => {
    setData(newData);
    setFileName(sourceName);
    setIsStreaming(false);
    setAiAnalysis(null);
  };

  const toggleStreaming = () => {
    setIsStreaming(!isStreaming);
    if (!isStreaming) setFileName(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsStreaming(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws) as any[];

      const processedData: ProductionData[] = rawData.map((row, idx) => {
        const keys = Object.keys(row);
        const valueKey = keys.find(k => k.toLowerCase().includes('value') || k.toLowerCase().includes('mätvärde') || !isNaN(Number(row[k])));
        const timeKey = keys.find(k => k.toLowerCase().includes('time') || k.toLowerCase().includes('datum') || k.toLowerCase().includes('tid'));
        const tempKey = keys.find(k => k.toLowerCase().includes('temp'));
        const pressKey = keys.find(k => k.toLowerCase().includes('tryck') || k.toLowerCase().includes('press'));
        
        return {
          timestamp: timeKey ? new Date(row[timeKey]).toISOString() : new Date(Date.now() - (rawData.length - idx) * 60000).toISOString(),
          value: Number(row[valueKey || keys[0]]),
          temperature: tempKey ? Number(row[tempKey]) : 20 + Math.random() * 5,
          pressure: pressKey ? Number(row[pressKey]) : 100 + Math.random() * 10
        };
      }).filter(d => !isNaN(d.value));

      if (processedData.length > 0) {
        setData(processedData);
        setAiAnalysis(null);
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const templateData = [
      { Tid: new Date().toLocaleString('sv-SE'), Värde: 10.2, Temperatur: 22.5, Tryck: 102.1 },
      { Tid: new Date(Date.now() - 60000).toLocaleString('sv-SE'), Värde: 9.8, Temperatur: 21.8, Tryck: 101.5 },
      { Tid: new Date(Date.now() - 120000).toLocaleString('sv-SE'), Värde: 10.5, Temperatur: 23.1, Tryck: 103.0 },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "produktionsdata_mall.xlsx");
  };

  const handlePrint = () => {
    window.print();
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const statsSummary = JSON.stringify(stats);
      const dataPoints = data.slice(-30).map(d => `${d.timestamp}: ${typeof d[selectedMetric] === 'number' ? d[selectedMetric].toFixed(2) : 'N/A'}`).join('\n');
      const anomaliesSummary = JSON.stringify(anomalies);
      
      // Step 1: Technical Analysis (The Statistician)
      setAnalysisStep("Steg 1: Statistisk Granskning...");
      const step1Prompt = `
        Du är en Senior Statistiker inom produktion (Expert på SPC och Nelson Rules). Analysera följande data:
        Mätvärde: ${selectedMetric}
        Statistik: ${statsSummary}
        Anomalier: ${anomaliesSummary}
        Senaste 30 punkterna:
        ${dataPoints}
        
        Din uppgift är att ge en strikt teknisk och objektiv sammanfattning av processens stabilitet. 
        Analysera Cp/Cpk och Pp/Ppk (skillnaden mellan potential och faktiskt utfall).
        Identifiera mönster som "mixture", "stratification", "hugging" eller "oscillation" baserat på Western Electric/Nelson rules.
        Svara på svenska med fokus på siffror och trender.
      `;
      const step1Response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: step1Prompt,
      });
      const technicalSummary = step1Response.text;

      // Step 2: Diagnostic Analysis (The Diagnostician)
      setAnalysisStep("Steg 2: Diagnostisk Analys...");
      const step2Prompt = `
        Du är en Expert på Rotorsaksanalys (RCA) och industriell felsökning. 
        Baserat på denna statistiska granskning:
        "${technicalSummary}"
        
        Förklara de fysiska orsakerna bakom de statistiska mönstren. 
        Varför uppstår denna specifika variation? 
        Koppla samman drift med termiska effekter, verktygsförslitning, materialvariationer eller operatörsfel (överjustering). 
        Analysera om variansen är "Common Cause" eller "Special Cause". Svara på svenska.
      `;
      const step2Response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: step2Prompt,
      });
      const diagnosticSummary = step2Response.text;

      // Step 3: Actionable Recommendations (The Advisor)
      setAnalysisStep("Steg 3: Strategiska Rekommendationer...");
      const today = new Date().toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
      const step3Prompt = `
        Du är en Senior Produktionsrådgivare. Skapa en mycket professionell och "prescriptive" produktionsrapport baserat på följande information.
        
        Teknisk statistisk analys: "${technicalSummary}"
        Diagnostisk rotorsaksanalys: "${diagnosticSummary}"
        
        Rapporten SKALL börja med dagens datum i fetstil längst upp.
        
        Din rapport ska följa denna struktur strikt:

        # ⚠️ PRODUKTIONSRAPPORT: [KORT KRAFTFULL RUBRIK]
        **Datum:** ${today}  
        **Status:** [RÖD/GUL/GRÖN]  
        **Process:** [Kort teknisk beskrivning av huvudproblemet, t.ex. "Instabilitet i variation" eller "Termisk drift"]

        ## 1. Övergripande status: [FÄRG]
        [En tydlig sammanfattning av om processen är kapabel (Cp/Cpk) och om vi producerar acceptabel kvalitet just nu.]

        ## 2. Vad händer just nu?
        [Analys av mätpunkterna. Nämn specifika klockslag för anomalier om de finns i datan. Beskriv mönster som "Hunting", "Drift" eller "Shift".]

        ## 3. Prognos för närmaste timmen
        [Baserat på trenden, vad är sannolikheten för kassation (skrot) inom kort?]

        ## 4. Konkreta åtgärder (Prescriptive Actions)
        [Ge 3-5 numrerade, mycket specifika åtgärder för operatören. T.ex. "Kontrollera kylvätskenivå", "Justera offset med -0.05", "Inspektera skärstål".]

        ## 5. Beslutspunkt
        [Tydlig instruktion om när linjen måsta pausas för RCA eller verktygsbyte.]

        Använd ett auktoritärt språk för en expert. Svara på svenska.
      `;
      const step3Response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: step3Prompt,
      });

      const finalAnalysis = step3Response.text || "Kunde inte generera analys.";
      setAiAnalysis(finalAnalysis);
      
      // Save to Firebase
      if (user) {
        saveReportToFirebase(finalAnalysis);
      }

      setAnalysisStep(null);
      setActiveTab('analysis');
      setIsMobileMenuOpen(false);
    } catch (error) {
      console.error("AI Analysis failed:", error);
      setAiAnalysis("Ett fel uppstod vid analysen.");
      setAnalysisStep(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Firebase Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchReports();
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchReports = async () => {
    try {
      const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);
      const fetchedReports = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReports(fetchedReports);
    } catch (error) {
      console.error("Error fetching reports:", error);
    }
  };

  const saveReportToFirebase = async (content: string) => {
    if (!user) return;
    
    // Extract status from content (Red/Yellow/Green)
    let status = 'GRÖN';
    if (content.includes('RÖD')) status = 'RÖD';
    else if (content.includes('GUL')) status = 'GUL';

    try {
      await addDoc(collection(db, 'reports'), {
        timestamp: new Date().toISOString(),
        content,
        status,
        metric: selectedMetric,
        userId: user.uid
      });
      fetchReports();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    }
  };
  const zoom = () => {
    let _refAreaLeft = refAreaLeft;
    let _refAreaRight = refAreaRight;

    if (_refAreaLeft === _refAreaRight || _refAreaRight === '') {
      setRefAreaLeft('');
      setRefAreaRight('');
      return;
    }

    // xAxis domain
    if (_refAreaLeft > _refAreaRight) [_refAreaLeft, _refAreaRight] = [_refAreaRight, _refAreaLeft];

    // Calculate Y-axis limits for the selected range
    const rangeData = data.filter(d => d.timestamp >= _refAreaLeft && d.timestamp <= _refAreaRight);
    if (rangeData.length > 0) {
      const values = rangeData.map(d => Number(d[selectedMetric] || 0));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = (max - min) * 0.1;
      setBottom(min - padding);
      setTop(max + padding);
    }

    setRefAreaLeft('');
    setRefAreaRight('');
    setLeft(_refAreaLeft);
    setRight(_refAreaRight);
  };

  const zoomOut = () => {
    setLeft('dataMin');
    setRight('dataMax');
    setTop('auto');
    setBottom('auto');
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  const trendZoom = () => {
    let _refAreaLeft = trendRefAreaLeft;
    let _refAreaRight = trendRefAreaRight;

    if (_refAreaLeft === _refAreaRight || _refAreaRight === '') {
      setTrendRefAreaLeft('');
      setTrendRefAreaRight('');
      return;
    }

    if (_refAreaLeft > _refAreaRight) [_refAreaLeft, _refAreaRight] = [_refAreaRight, _refAreaLeft];

    // Calculate Y-axis limits for trend
    const rangeData = statsHistory.filter(d => d.timestamp >= _refAreaLeft && d.timestamp <= _refAreaRight);
    if (rangeData.length > 0) {
      const values = rangeData.map(d => Number(d[selectedStatsMetric] || 0));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = (max - min) * 0.1;
      setTrendBottom(min - padding);
      setTrendTop(max + padding);
    }

    setTrendRefAreaLeft('');
    setTrendRefAreaRight('');
    setTrendLeft(_refAreaLeft);
    setTrendRight(_refAreaRight);
  };

  const trendZoomOut = () => {
    setTrendLeft('dataMin');
    setTrendRight('dataMax');
    setTrendTop('auto');
    setTrendBottom('auto');
    setTrendRefAreaLeft('');
    setTrendRefAreaRight('');
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-4 rounded-xl shadow-xl backdrop-blur-md bg-opacity-90">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
            {new Date(label).toLocaleString('sv-SE', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            })}
          </p>
          <div className="space-y-2">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-8">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs font-bold text-foreground">{entry.name}:</span>
                </div>
                <span className="text-xs font-black text-primary">
                  {typeof entry.value === 'number' ? entry.value.toFixed(3) : entry.value}
                </span>
              </div>
            ))}
            {payload[0] && payload[0].payload && (
              <div className="pt-2 mt-2 border-t border-border/50">
                <div className="flex items-center justify-between gap-8">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Status:</span>
                  <span className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                    (payload[0].value > usl || payload[0].value < lsl) 
                      ? "bg-rose-500/10 text-rose-500" 
                      : "bg-emerald-500/10 text-emerald-500"
                  )}>
                    {(payload[0].value > usl || payload[0].value < lsl) ? "Utanför" : "Inom gräns"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const DistTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-4 rounded-xl shadow-xl backdrop-blur-md bg-opacity-90">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Intervall</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs font-bold text-foreground">Område:</span>
              <span className="text-xs font-black text-primary">{label}</span>
            </div>
            <div className="flex items-center justify-between gap-8">
              <span className="text-xs font-bold text-foreground">Antal:</span>
              <span className="text-xs font-black text-primary">{payload[0].value}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="no-print bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight">Production AI</h1>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">SPC Dashboard</p>
            </div>
          </div>
          
          {/* Desktop Actions */}
          <div className="no-print hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border">
              <Button 
                variant={fileName ? 'primary' : 'ghost'} 
                size="sm" 
                onClick={() => setIsImportWizardOpen(true)}
              >
                <Upload className="w-3.5 h-3.5" />
                {fileName ? fileName : "Importera data..."}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsImportWizardOpen(true)} title="Öppna Guide & Mallar">
                <Info className="w-3.5 h-3.5" />
              </Button>
            </div>

            <Button 
              variant={isStreaming ? 'danger' : 'success'} 
              size="sm" 
              onClick={toggleStreaming}
            >
              {isStreaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isStreaming ? "Stoppa Stream" : "Starta Stream"}
            </Button>

            <Button variant="outline" size="icon" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>

            <Button variant="primary" size="sm" onClick={runAiAnalysis} isLoading={isAnalyzing}>
              <Brain className="w-4 h-4" />
              {isAnalyzing ? (analysisStep || 'Analyserar...') : 'AI Analys'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => setIsSopOpen(true)} className="gap-2">
              <BookOpen className="w-4 h-4" />
              SOP
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            {user ? (
              <div className="flex items-center gap-3 pl-2">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Expertrådgivare</p>
                  <p className="text-xs font-black truncate max-w-[150px]">{user.email}</p>
                </div>
                <Button variant="outline" size="sm" onClick={logout} className="gap-2">
                  <X className="w-4 h-4" /> Logga ut
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={signInWithGoogle} className="gap-2">
                <Activity className="w-4 h-4" /> Logga in
              </Button>
            )}

            <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="no-print lg:hidden flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="no-print lg:hidden absolute top-16 left-0 w-full bg-card border-b border-border p-4 space-y-4 shadow-xl animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="w-full" onClick={() => { setIsImportWizardOpen(true); setIsMobileMenuOpen(false); }}>
                <Upload className="w-4 h-4" /> Importera data (Guide)
              </Button>
            </div>
            <Button 
              variant={isStreaming ? 'danger' : 'success'} 
              className="w-full" 
              onClick={() => { toggleStreaming(); setIsMobileMenuOpen(false); }}
            >
              {isStreaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isStreaming ? "Stoppa Stream" : "Starta Stream"}
            </Button>
            <Button variant="primary" className="w-full" onClick={runAiAnalysis} isLoading={isAnalyzing}>
              <Brain className="w-4 h-4" /> {isAnalyzing ? (analysisStep || 'Analyserar...') : 'Kör AI Analys'}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => { setIsSopOpen(true); setIsMobileMenuOpen(false); }}>
              <BookOpen className="w-4 h-4" /> SOP / Bruksanvisning
            </Button>
            <Button variant="outline" className="w-full" onClick={() => { handleRefresh(); setIsMobileMenuOpen(false); }}>
              <RefreshCw className="w-4 h-4" /> Återställ
            </Button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Navigation Tabs */}
        <div className="no-print flex gap-1 bg-muted p-1 rounded-xl w-full sm:w-fit mb-6 md:mb-8">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2",
              activeTab === 'dashboard' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={cn(
              "flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2",
              activeTab === 'analysis' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Brain className="w-4 h-4" />
            AI Insights
            {aiAnalysis && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2",
              activeTab === 'history' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="w-4 h-4" />
            Historik
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <div className="no-print space-y-6 md:space-y-8">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <StatCard 
                title="Cpk (Potential)" 
                value={stats?.cpk ? stats.cpk.toFixed(3) : '0.000'} 
                icon={<TrendingUp className="w-4 h-4" />}
                status={stats && stats.cpk > 1.33 ? 'success' : 'warning'}
                subValue={`Cp: ${stats?.cp ? stats.cp.toFixed(2) : '0.00'}`}
              />
              <StatCard 
                title="Ppk (Performance)" 
                value={stats?.ppk ? stats.ppk.toFixed(3) : '0.000'} 
                icon={<Activity className="w-4 h-4" />}
                status={stats && stats.ppk > 1.33 ? 'success' : 'danger'}
                subValue={`Pp: ${stats?.pp ? stats.pp.toFixed(2) : '0.00'}`}
              />
              <StatCard 
                title="Normalfördelning" 
                value={stats?.isNormal ? 'JA' : 'NEJ'} 
                icon={<Brain className="w-4 h-4" />}
                status={stats?.isNormal ? 'success' : 'warning'}
                subValue={`p: ${stats?.shapiroWilkP ? stats.shapiroWilkP.toFixed(4) : '0.0000'}`}
              />
              <StatCard 
                title="Process-Status" 
                value={anomalies.length === 0 ? 'Stabil' : 'Instabil'} 
                icon={<AlertCircle className="w-4 h-4" />}
                status={anomalies.length === 0 ? 'success' : 'danger'}
                subValue={`${anomalies.length} avvikelser`}
              />
            </div>

            {/* Detailed Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-muted/20 border-dashed">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Medelvärde & Spridning</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Mean</p>
                    <p className="text-sm font-black">{stats?.mean ? stats.mean.toFixed(3) : '–'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">σ Overall / σ Within</p>
                    <p className="text-sm font-black">
                      {stats?.stdDev ? stats.stdDev.toFixed(3) : '–'} / {stats?.stdDevWithin ? stats.stdDevWithin.toFixed(3) : '–'}
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-muted/20 border-dashed">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Form & Fördelning</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Skewness</p>
                    <p className="text-sm font-black">{stats?.skewness ? stats.skewness.toFixed(3) : '–'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Kurtosis</p>
                    <p className="text-sm font-black">{stats?.kurtosis ? stats.kurtosis.toFixed(3) : '–'}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-muted/20 border-dashed">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Kontrollgränser (3σ)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">UCL</p>
                    <p className="text-sm font-black text-amber-600">{stats?.ucl ? stats.ucl.toFixed(3) : '–'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">LCL</p>
                    <p className="text-sm font-black text-amber-600">{stats?.lcl ? stats.lcl.toFixed(3) : '–'}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Main Chart */}
            <Card padding="none" className="p-4 md:p-6">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
                <div className="space-y-1">
                  <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    {selectedMetric === 'value' ? 'Process Control Chart' : 
                     selectedMetric === 'temperature' ? 'Temperaturövervakning' : 'Tryckövervakning'}
                    {(left !== 'dataMin' || right !== 'dataMax') && (
                      <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">
                        ZOOMAD VY
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    Realtidsövervakning av produktionskvalitet
                    <span className="hidden sm:inline bg-primary/10 text-primary px-2 py-0.5 rounded-full lowercase font-medium normal-case">
                      (Klicka & dra för att zooma)
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {(left !== 'dataMin' || right !== 'dataMax') && (
                    <button 
                      onClick={zoomOut}
                      className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground hover:text-foreground rounded-lg text-[10px] font-bold uppercase transition-all border border-border"
                    >
                      <Search className="w-3 h-3" />
                      Återställ Zoom
                    </button>
                  )}
                  <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {uslLabel}: <span className="text-primary font-black">{typeof usl === 'number' ? usl.toFixed(1) : usl}</span>
                    </div>
                    <div className="w-px h-3 bg-border mx-1" />
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {lslLabel}: <span className="text-primary font-black">{typeof lsl === 'number' ? lsl.toFixed(1) : lsl}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      showSettings ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    )}
                  >
                    <Settings className={cn("w-4 h-4", showSettings && "animate-spin-slow")} />
                  </button>
                </div>
              </div>

              {showSettings && (
                <div className="mb-8 p-6 bg-muted/50 rounded-2xl border border-border animate-in fade-in slide-in-from-top-2 duration-300 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* USL Settings */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Gräns: {uslLabel}</label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="text" 
                          value={uslLabel} 
                          onChange={(e) => setUslLabel(e.target.value)}
                          className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Namn"
                        />
                        <input 
                          type="number" step="0.1" value={usl} 
                          onChange={(e) => setUsl(parseFloat(e.target.value) || 0)}
                          className="w-20 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                        />
                      </div>
                    </div>

                    {/* LSL Settings */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Gräns: {lslLabel}</label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="text" 
                          value={lslLabel} 
                          onChange={(e) => setLslLabel(e.target.value)}
                          className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Namn"
                        />
                        <input 
                          type="number" step="0.1" value={lsl} 
                          onChange={(e) => setLsl(parseFloat(e.target.value) || 0)}
                          className="w-20 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 border-t border-border/50">
                    {/* Metric & Type */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Data & Visualisering</label>
                      <div className="space-y-3">
                        <select 
                          value={selectedMetric} 
                          onChange={(e) => setSelectedMetric(e.target.value)}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                        >
                          <option value="value">Dimension (mm)</option>
                          <option value="temperature">Temperatur (°C)</option>
                          <option value="pressure">Tryck (bar)</option>
                        </select>
                        <div className="flex bg-card border border-border p-1 rounded-lg">
                          {(['line', 'area', 'bar'] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => setChartType(type)}
                              className={cn(
                                "flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all",
                                chartType === type ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Overlays */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Analyslager</label>
                      <div className="space-y-3">
                        <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                          <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Glidande Medel</span>
                          <input 
                            type="checkbox" 
                            checked={showMovingAverage} 
                            onChange={(e) => setShowMovingAverage(e.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          />
                        </label>
                        <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                          <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Statistiska Band (2σ)</span>
                          <input 
                            type="checkbox" 
                            checked={showStatsBands} 
                            onChange={(e) => setShowStatsBands(e.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Axis Settings */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Axelinställningar</label>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Visa X-axel</span>
                            <input 
                              type="checkbox" 
                              checked={showXAxis} 
                              onChange={(e) => setShowXAxis(e.target.checked)}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                          </label>
                          {showXAxis && (
                            <input 
                              type="text" 
                              value={xAxisLabel} 
                              onChange={(e) => setXAxisLabel(e.target.value)}
                              className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none"
                              placeholder="Etikett X-axel"
                            />
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Visa Y-axel</span>
                            <input 
                              type="checkbox" 
                              checked={showYAxis} 
                              onChange={(e) => setShowYAxis(e.target.checked)}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            />
                          </label>
                          {showYAxis && (
                            <input 
                              type="text" 
                              value={yAxisLabel} 
                              onChange={(e) => setYAxisLabel(e.target.value)}
                              className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none"
                              placeholder="Etikett Y-axel"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="h-[300px] md:h-[450px] w-full cursor-crosshair select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart 
                    data={getChartData()}
                    onMouseDown={(e: any) => e && setRefAreaLeft(e.activeLabel)}
                    onMouseMove={(e: any) => e && refAreaLeft && setRefAreaRight(e.activeLabel)}
                    onMouseUp={zoom}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis 
                      dataKey="timestamp" 
                      hide={!showXAxis} 
                      stroke="var(--muted-foreground)" 
                      fontSize={10} 
                      domain={[left, right]}
                      type="category"
                      allowDataOverflow
                      tickFormatter={(time) => {
                        const date = new Date(time);
                        if (left !== 'dataMin') {
                          return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        }
                        return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                      }}
                      label={showXAxis ? { value: xAxisLabel, position: 'insideBottom', offset: -5, fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' } : undefined}
                    />
                    <YAxis 
                      hide={!showYAxis}
                      domain={[bottom, top]} 
                      stroke="var(--muted-foreground)" 
                      fontSize={10} 
                      fontWeight="bold" 
                      label={showYAxis ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' } : undefined}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    
                    {refAreaLeft && refAreaRight ? (
                      <ReferenceAreaAny x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="var(--primary)" fillOpacity={0.1} />
                    ) : null}

                    {/* Specification Limits */}
                    <ReferenceLine y={usl} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: uslLabel, position: 'right', fill: '#f43f5e', fontSize: 10, fontWeight: 'bold' }} />
                    <ReferenceLine y={lsl} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: lslLabel, position: 'right', fill: '#f43f5e', fontSize: 10, fontWeight: 'bold' }} />
                    
                    {/* Control Limits (UCL/LCL) */}
                    {stats && (
                      <>
                        <ReferenceLine y={stats.ucl} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'UCL', position: 'left', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} />
                        <ReferenceLine y={stats.lcl} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'LCL', position: 'left', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} />
                        <ReferenceLine y={stats.mean} stroke="var(--primary)" strokeOpacity={0.5} label={{ value: 'Mean', position: 'insideTopLeft', fill: 'var(--primary)', fontSize: 10, fontWeight: 'bold' }} />
                      </>
                    )}

                    {/* Statistical Bands */}
                    {showStatsBands && (
                      <Area 
                        type="monotone" 
                        dataKey="upperBand" 
                        stroke="none" 
                        fill="#f59e0b" 
                        fillOpacity={0.05} 
                        name="Control Band (UCL)"
                      />
                    )}
                    {showStatsBands && (
                      <Area 
                        type="monotone" 
                        dataKey="lowerBand" 
                        stroke="none" 
                        fill="#f59e0b" 
                        fillOpacity={0.05} 
                        name="Control Band (LCL)"
                      />
                    )}

                    {/* Main Visualization */}
                    {chartType === 'area' && (
                      <Area 
                        type="monotone" 
                        dataKey={selectedMetric} 
                        stroke="var(--primary)" 
                        fill="var(--primary)" 
                        fillOpacity={0.1} 
                        strokeWidth={2}
                      />
                    )}
                    {chartType === 'bar' && (
                      <Bar 
                        dataKey={selectedMetric} 
                        fill="var(--primary)" 
                        radius={[4, 4, 0, 0]} 
                        opacity={0.8}
                      />
                    )}
                    {chartType === 'line' && (
                      <Line 
                        type="monotone" 
                        dataKey={selectedMetric} 
                        stroke="var(--primary)" 
                        strokeWidth={2.5} 
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          const val = Number(payload[selectedMetric]);
                          const isAnomaly = !!payload.anomalyType;
                          const isOut = val > usl || val < lsl;
                          
                          if (isAnomaly || isOut) {
                            return (
                              <g style={{ pointerEvents: 'none' }}>
                                <circle cx={cx} cy={cy} r={8} fill={isOut ? "#f43f5e" : "#f59e0b"} fillOpacity={0.25} />
                                <circle cx={cx} cy={cy} r={4} fill={isOut ? "#f43f5e" : "#f59e0b"} stroke="var(--card)" strokeWidth={1.5} />
                                {payload.testNumber && (
                                  <text 
                                    x={cx} 
                                    y={cy - 12} 
                                    textAnchor="middle" 
                                    fontSize="10" 
                                    fontWeight="black" 
                                    fill={isOut ? "#f43f5e" : "#f59e0b"}
                                    className="select-none"
                                  >
                                    {payload.testNumber}
                                  </text>
                                )}
                              </g>
                            );
                          }
                          return <circle cx={cx} cy={cy} r={2} fill="var(--primary)" />;
                        }}
                      />
                    )}

                    {/* Moving Average Overlay */}
                    {showMovingAverage && (
                      <Line 
                        type="monotone" 
                        dataKey="movingAverage" 
                        stroke="#fbbf24" 
                        strokeWidth={2} 
                        strokeDasharray="5 5" 
                        dot={false}
                        name="Glidande Medelvärde"
                      />
                    )}

                    <ReferenceLine y={usl} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: uslLabel, position: 'right', fill: '#f43f5e', fontSize: 10, fontWeight: 'bold' }} />
                    <ReferenceLine y={lsl} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: lslLabel, position: 'right', fill: '#f43f5e', fontSize: 10, fontWeight: 'bold' }} />
                    <ReferenceLine y={(usl + lsl) / 2} stroke="var(--border)" strokeDasharray="5 5" />
                    
                    {refAreaLeft && refAreaRight ? (
                      <ReferenceAreaAny x1={refAreaLeft} x2={refAreaRight} fill="var(--primary)" fillOpacity={0.3} />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Anomalies Section */}
            {anomalies.length > 0 && (
              <Card className="p-4 md:p-6 border-rose-500/20 bg-rose-500/[0.02] animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold tracking-tight text-foreground">Detekterade Avvikelser</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Systemet har identifierat {anomalies.length} anomalier</p>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-rose-500/10 text-rose-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-500/20">
                    Hög Prioritet
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {anomalies.map((anomaly) => (
                    <div key={anomaly.id} className="p-4 bg-card border border-border rounded-xl hover:border-rose-500/30 transition-all group shadow-sm hover:shadow-md">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                            {new Date(anomaly.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                          <div className="text-lg font-black tracking-tight text-rose-500">
                            {typeof anomaly.value === 'number' ? anomaly.value.toFixed(2) : anomaly.value}
                          </div>
                        </div>
                        <div className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border",
                          anomaly.type === 'out-of-bounds' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : 
                          anomaly.type === 'trend' ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" :
                          anomaly.type === 'shift-in-mean' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                          anomaly.type === 'low-variance' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                          "bg-orange-500/10 text-orange-500 border-orange-500/20"
                        )}>
                          {anomaly.type === 'out-of-bounds' ? 'Limiter' : 
                           anomaly.type === 'trend' ? 'Trend' : 
                           anomaly.type === 'shift-in-mean' ? 'Skift' : 
                           anomaly.type === 'low-variance' ? 'Låg Var' :
                           'Variation'}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed italic">
                        "{anomaly.explanation}"
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Cp/Cpk Trend Chart */}
            <Card padding="none" className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Kapacitetstrend (Rolling {selectedStatsMetric.toUpperCase()})
                    {(trendLeft !== 'dataMin' || trendRight !== 'dataMax') ? (
                      <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">
                        ZOOMAD VY
                      </span>
                    ) : (
                      <span className="hidden sm:inline text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-2 normal-case">
                        Klicka & dra för att zooma
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                    {(['cp', 'cpk'] as const).map((metric) => (
                      <button
                        key={metric}
                        onClick={() => setSelectedStatsMetric(metric)}
                        className={cn(
                          "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                          selectedStatsMetric === metric ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {metric}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(trendLeft !== 'dataMin' || trendRight !== 'dataMax') && (
                    <button 
                      onClick={trendZoomOut}
                      className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground hover:text-foreground rounded-lg text-[10px] font-bold uppercase transition-all border border-border"
                    >
                      <Search className="w-3 h-3" />
                      Återställ Zoom
                    </button>
                  )}
                  <button 
                    onClick={() => setShowTrendSettings(!showTrendSettings)}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      showTrendSettings ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    )}
                  >
                    <Settings className={cn("w-4 h-4", showTrendSettings && "animate-spin-slow")} />
                  </button>
                </div>
              </div>

              {showTrendSettings && (
                <div className="mb-8 p-6 bg-muted/50 rounded-2xl border border-border animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Rullande Fönster (antal punkter)</label>
                      <input 
                        type="number" min="5" max="100" value={trendWindowSize} 
                        onChange={(e) => setTrendWindowSize(parseInt(e.target.value) || 20)}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Axelinställningar</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Visa X</span>
                            <input type="checkbox" checked={showTrendXAxis} onChange={(e) => setShowTrendXAxis(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                          </label>
                          {showTrendXAxis && <input type="text" value={trendXAxisLabel} onChange={(e) => setTrendXAxisLabel(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none" placeholder="X-etikett" />}
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                            <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Visa Y</span>
                            <input type="checkbox" checked={showTrendYAxis} onChange={(e) => setShowYAxisTrend(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                          </label>
                          {showTrendYAxis && <input type="text" value={trendYAxisLabel} onChange={(e) => setTrendYAxisLabel(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none" placeholder="Y-etikett" />}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="h-[200px] md:h-[250px] w-full cursor-crosshair select-none">
                {statsHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={statsHistory}
                      onMouseDown={(e: any) => e && setTrendRefAreaLeft(e.activeLabel)}
                      onMouseMove={(e: any) => e && trendRefAreaLeft && setTrendRefAreaRight(e.activeLabel)}
                      onMouseUp={trendZoom}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="timestamp" 
                        hide={!showTrendXAxis} 
                        stroke="var(--muted-foreground)" 
                        fontSize={10} 
                        domain={[trendLeft, trendRight]}
                        type="category"
                        allowDataOverflow
                        tickFormatter={(time) => {
                          const date = new Date(time);
                          if (trendLeft !== 'dataMin') {
                            return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          }
                          return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                        }}
                        label={showTrendXAxis ? { value: trendXAxisLabel, position: 'insideBottom', offset: -5, fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' } : undefined}
                      />
                      <YAxis 
                        hide={!showTrendYAxis}
                        domain={[trendBottom, trendTop]} 
                        stroke="var(--muted-foreground)" 
                        fontSize={10} 
                        fontWeight="bold" 
                        label={showTrendYAxis ? { value: trendYAxisLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' } : undefined}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      
                      {trendRefAreaLeft && trendRefAreaRight ? (
                        <ReferenceAreaAny x1={trendRefAreaLeft} x2={trendRefAreaRight} strokeOpacity={0.3} fill="var(--primary)" fillOpacity={0.1} />
                      ) : null}

                      <ReferenceLine y={1.33} stroke="#10b981" strokeDasharray="3 3" label={{ value: '1.33', position: 'right', fill: '#10b981', fontSize: 10 }} />
                      <ReferenceLine y={1.0} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '1.0', position: 'right', fill: '#f59e0b', fontSize: 10 }} />
                      
                      <Line 
                        type="monotone" 
                        dataKey={selectedStatsMetric} 
                        stroke="var(--primary)" 
                        strokeWidth={2} 
                        dot={false}
                        animationDuration={300}
                      />

                      {trendRefAreaLeft && trendRefAreaRight ? (
                        <ReferenceAreaAny x1={trendRefAreaLeft} x2={trendRefAreaRight} fill="var(--primary)" fillOpacity={0.3} />
                      ) : null}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-medium italic">
                    Behöver minst {trendWindowSize} mätpunkter för att visa trend...
                  </div>
                )}
              </div>
            </Card>

            {/* Distribution & Warning */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Distribution
                  </h3>
                  <button 
                    onClick={() => setShowDistSettings(!showDistSettings)}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      showDistSettings ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    )}
                  >
                    <Settings className={cn("w-4 h-4", showDistSettings && "animate-spin-slow")} />
                  </button>
                </div>

                {showDistSettings && (
                  <div className="mb-8 p-6 bg-muted/50 rounded-2xl border border-border animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Antal Staplar (Bins)</label>
                        <input 
                          type="number" min="3" max="20" value={distBins} 
                          onChange={(e) => setDistBins(parseInt(e.target.value) || 8)}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Axelinställningar</label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Visa X</span>
                              <input type="checkbox" checked={showDistXAxis} onChange={(e) => setShowDistXAxis(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                            </label>
                            {showDistXAxis && <input type="text" value={distXAxisLabel} onChange={(e) => setDistXAxisLabel(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none" placeholder="X-etikett" />}
                          </div>
                          <div className="space-y-2">
                            <label className="flex items-center justify-between p-2 bg-card border border-border rounded-lg cursor-pointer group">
                              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Visa Y</span>
                              <input type="checkbox" checked={showDistYAxis} onChange={(e) => setShowDistYAxis(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                            </label>
                            {showDistYAxis && <input type="text" value={distYAxisLabel} onChange={(e) => setDistYAxisLabel(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-primary outline-none" placeholder="Y-etikett" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="h-[250px] md:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getHistogramData(data, selectedMetric, distBins)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="bin" 
                        hide={!showDistXAxis} 
                        fontSize={10} 
                        stroke="var(--muted-foreground)" 
                        label={showDistXAxis ? { value: distXAxisLabel, position: 'insideBottom', offset: -5, fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' } : undefined}
                      />
                      <YAxis 
                        hide={!showDistYAxis}
                        stroke="var(--muted-foreground)" 
                        fontSize={10} 
                        fontWeight="bold" 
                        label={showDistYAxis ? { value: distYAxisLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' } : undefined}
                      />
                      <Tooltip content={<DistTooltip />} />
                      <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} opacity={0.8}>
                        {getHistogramData(data, selectedMetric, distBins).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.count > 5 ? 'var(--primary)' : 'var(--muted)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="no-print space-y-6">
                <Card className="h-full flex flex-col justify-center">
                  <div className="flex items-start gap-4 text-amber-500 bg-amber-500/10 p-6 rounded-2xl border border-amber-500/20">
                    <AlertTriangle className="w-6 h-6 shrink-0" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-black uppercase tracking-widest">Systemvarning</h4>
                      <p className="text-xs font-bold leading-relaxed opacity-90">
                        Processen visar tecken på drift. Rekommenderar AI-analys för rotorsaksidentifiering och optimering av parametrar.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="max-w-4xl mx-auto">
            <Card padding="none" className="card-print">
              <div className="no-print bg-primary px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-primary-foreground">
                  <Brain className="w-6 h-6" />
                  <h3 className="font-bold text-lg">AI Multi-Agent Analysis</h3>
                </div>
              </div>
              
              <div className="p-6 md:p-8">
                {/* Print-only Header */}
                <div className="hidden print:block mb-8 border-b-2 border-primary pb-4">
                  <h1 className="text-2xl font-black text-primary">AI PRODUKTIONSANALYS</h1>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Statistisk Processkontroll • Realtidsrapport</p>
                  <p className="text-xs mt-2">Datum: {new Date().toLocaleDateString('sv-SE')}</p>
                </div>

                {!aiAnalysis && !isAnalyzing ? (
                  <div className="text-center py-12">
                    <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h4 className="text-xl font-bold mb-2">Ingen analys genererad</h4>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
                      Klicka på knappen nedan för att låta våra AI-agenter utvärdera din produktionsdata.
                    </p>
                    <Button size="lg" onClick={runAiAnalysis}>
                      Starta Analys
                    </Button>
                  </div>
                ) : isAnalyzing ? (
                  <div className="space-y-6 py-8">
                    <div className="flex items-center gap-4 animate-pulse">
                      <div className="w-10 h-10 bg-muted rounded-full" />
                      <div className="h-4 bg-muted rounded w-1/3" />
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 bg-muted rounded w-full" />
                      <div className="h-4 bg-muted rounded w-5/6" />
                      <div className="h-4 bg-muted rounded w-4/6" />
                    </div>
                    <div className="flex flex-col items-center gap-4 py-8">
                      <div className="relative">
                        <RefreshCw className="w-12 h-12 text-primary animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Brain className="w-5 h-5 text-primary" />
                        </div>
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-lg font-black tracking-tight text-foreground">Multi-Agent Samarbete</p>
                        <p className="text-sm font-bold text-primary animate-pulse">{analysisStep || 'Agenterna utbyter data...'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="prose dark:prose-invert max-w-none" ref={analysisRef}>
                    <div className="text-foreground/90 leading-relaxed text-sm md:text-base">
                      <Markdown>{aiAnalysis}</Markdown>
                    </div>
                    <div className="mt-12 pt-8 border-t border-border flex items-center justify-between print:hidden">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                        <FileText className="w-4 h-4" />
                        Baserat på {data.length} datapunkter
                      </div>
                      <Button variant="primary" size="sm" onClick={handlePrint} className="gap-2">
                        <Download className="w-4 h-4" />
                        Skriv ut / Spara som PDF
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
        
        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <FileText className="w-8 h-8 text-primary" />
                  Rapporthistorik
                </h2>
                <p className="text-muted-foreground font-medium">Tidigare analyser sparade i molnet.</p>
              </div>
              <Button variant="outline" onClick={fetchReports} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Uppdatera
              </Button>
            </div>

            {!user ? (
              <Card className="p-12 text-center flex flex-col items-center justify-center gap-6 border-dashed">
                <div className="p-4 bg-muted rounded-full">
                  <Activity className="w-12 h-12 text-muted-foreground" />
                </div>
                <div className="max-w-sm">
                  <h3 className="text-xl font-bold mb-2">Logga in för att se historik</h3>
                  <p className="text-muted-foreground text-sm">
                    Dina rapporter sparas säkert i molnet och kan kommas åt från alla dina enheter när du är inloggad.
                  </p>
                </div>
                <Button variant="primary" size="lg" onClick={signInWithGoogle} className="gap-2">
                  <Activity className="w-5 h-5" /> Logga in med Google
                </Button>
              </Card>
            ) : reports.length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground border-dashed">
                Inga sparade rapporter hittades. Kör en AI-analys för att skapa din första rapport.
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {reports.map((report) => (
                  <Card key={report.id} className="overflow-hidden border-border/50 hover:border-primary/50 transition-colors">
                    <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest text-white",
                          report.status === 'RÖD' ? 'bg-rose-500' : 
                          report.status === 'GUL' ? 'bg-amber-500' : 'bg-emerald-500'
                        )}>
                          {report.status}
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">
                          {new Date(report.timestamp).toLocaleString('sv-SE')}
                        </span>
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {report.metric}
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="prose prose-sm prose-slate dark:prose-invert max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        <Markdown>{report.content}</Markdown>
                      </div>
                      <div className="mt-6 flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full gap-2"
                          onClick={() => {
                            setAiAnalysis(report.content);
                            setActiveTab('analysis');
                          }}
                        >
                          <Search className="w-4 h-4" /> Öppna Analys
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      {isSopOpen && <SopModal isOpen={isSopOpen} onClose={() => setIsSopOpen(false)} />}
      <ImportWizard 
        isOpen={isImportWizardOpen} 
        onClose={() => setIsImportWizardOpen(false)} 
        onImport={handleImportedData}
        downloadTemplate={downloadTemplate}
      />
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <Card className="p-3 shadow-xl border-primary/20 bg-background/95 backdrop-blur-sm animate-in zoom-in-95 duration-200">
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 border-b border-border pb-1">
          {label}
        </p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-[10px] font-bold text-foreground">{entry.name}:</span>
              </div>
              <span className="text-xs font-black text-primary">
                {typeof entry.value === 'number' ? entry.value.toFixed(3) : entry.value}
              </span>
            </div>
          ))}
          {payload[0].payload.anomalyType && (
            <div className="mt-2 pt-2 border-t border-rose-500/20 text-rose-500">
               <p className="text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                 <AlertCircle className="w-3 h-3" /> Avvikelse Detekterad
               </p>
               <p className="text-[9px] font-bold leading-tight mt-1 italic">
                 "{payload[0].payload.explanation || 'Statistisk anomali identifierad.'}"
               </p>
            </div>
          )}
        </div>
      </Card>
    );
  }
  return null;
}

function DistTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const entry = payload[0];
    return (
      <Card className="p-3 shadow-xl border-primary/20 bg-background/95 backdrop-blur-sm animate-in zoom-in-95 duration-200">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border pb-1 mb-1">
            Intervall: {entry.payload.bin}
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-bold">Antal:</span>
            <span className="text-xs font-black text-primary">{entry.value}</span>
          </div>
        </div>
      </Card>
    );
  }
  return null;
}

function SopModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-primary/20">
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">SOP / Bruksanvisning</h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Standard Operating Procedure • v1.0</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <SopSection 
            title="1. Introduktion" 
            icon={<Info className="w-4 h-4" />}
            content="Denna dashboard används för statistisk processkontroll (SPC). Den hjälper dig att övervaka produktionskvalitet i realtid genom att beräkna kapabilitetsindex (Cp/Cpk) och visualisera trender."
          />

          <SopSection 
            title="2. Datahantering" 
            icon={<Upload className="w-4 h-4" />}
            content={
              <ul className="space-y-2">
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Importera:</strong> Klicka på 'Excel' för att ladda upp din egen data.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Mall:</strong> Använd 'Mall' för att se hur din Excel-fil ska vara strukturerad.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Återställ:</strong> Använd refresh-ikonen för att rensa och ladda exempeldata.</span>
                </li>
              </ul>
            }
          />

          <SopSection 
            title="3. Interaktion & Analys" 
            icon={<Search className="w-4 h-4" />}
            content={
              <ul className="space-y-2">
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Zooma:</strong> Klicka och dra i graferna för att förstora ett tidsintervall.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>AI Analys:</strong> Kör en automatisk analys av processen via Gemini AI.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Tooltips:</strong> Håll musen över punkter för att se exakta värden och status.</span>
                </li>
              </ul>
            }
          />

          <SopSection 
            title="4. Inställningar" 
            icon={<Settings className="w-4 h-4" />}
            content="Klicka på kugghjulet vid varje graf för att justera USL/LSL, rullande fönster för trender eller antal staplar i histogrammet."
          />

          <SopSection 
            title="5. Streaming" 
            icon={<Play className="w-4 h-4" />}
            content="Aktivera 'Starta Stream' för att simulera inkommande data var 3:e sekund. Detta är användbart för att testa larmgränser och realtidsuppdateringar."
          />

          <SopSection 
            title="6. API Integration" 
            icon={<FileText className="w-4 h-4" />}
            content={
              <div className="space-y-4">
                <p className="text-xs">Du kan skicka data till appen via ett REST API. Detta gör det möjligt att koppla upp sensorer eller PLC-system direkt.</p>
                <div className="bg-muted p-3 rounded-lg font-mono text-[10px] space-y-2">
                  <p className="text-primary font-bold">POST /api/production-data</p>
                  <pre className="text-foreground/70">
{`{
  "value": 10.5,
  "temperature": 22.3,
  "pressure": 101.2
}`}
                  </pre>
                </div>
              </div>
            }
          />

          <SopSection 
            title="7. Databaskoppling (SQL)" 
            icon={<Settings className="w-4 h-4" />}
            content={
              <div className="space-y-4">
                <p className="text-xs">Appen är förberedd för PostgreSQL. För att aktivera permanent lagring:</p>
                <ol className="list-decimal list-inside text-[10px] space-y-2 ml-1">
                  <li>Gå till <strong>Settings</strong> i AI Studio.</li>
                  <li>Lägg till miljövariabler: <code className="bg-muted px-1">DB_HOST</code>, <code className="bg-muted px-1">DB_NAME</code>, <code className="bg-muted px-1">DB_USER</code>, <code className="bg-muted px-1">DB_PASSWORD</code>.</li>
                  <li>Starta om servern. Appen skapar automatiskt tabellen <code className="bg-muted px-1">production_logs</code>.</li>
                </ol>
                <p className="text-[10px] text-amber-500 font-bold">⚠️ Om inga variabler anges körs appen i "Mock Mode" med exempeldata.</p>
              </div>
            }
          />

          <SopSection 
            title="8. Statistiska Metoder" 
            icon={<Brain className="w-4 h-4" />}
            content={
              <div className="space-y-4">
                <p className="text-xs font-bold text-primary italic">Appen följer standardiserade metoder för statistisk processkontroll (liknande Minitab):</p>
                <div className="space-y-2">
                  <p className="text-[10px]"><span className="font-bold">Kapabilitet (Cp/Cpk):</span> Beräknas enligt <span className="font-bold underline text-primary">Shewhart-metoden</span>. Vi använder <em>Within-Subgroup variation</em> (Average Moving Range / 1.128) för att se processens kortsiktiga potential.</p>
                  <p className="text-[10px]"><span className="font-bold">Prestanda (Pp/Ppk):</span> Beräknas med <span className="font-bold underline text-primary">Overall Standard Deviation</span> (rotformeln). Detta visar hur processen faktiskt presterat över tid inklusive alla typer av variation.</p>
                  <p className="text-[10px]"><span className="font-bold">Trend-detektering:</span> Vi analyserar <span className="font-bold underline text-primary">Nelson Rules / Western Electric Rules</span>, inklusive:</p>
                  <ul className="list-disc list-inside text-[9px] ml-2 text-muted-foreground">
                    <li>Test 1: Punkt utanför 3-sigma (UCL/LCL).</li>
                    <li>Test 2: 9 punkter i rad på samma sida om medelvärdet.</li>
                    <li>Test 3: 6 punkter i rad med stadig ökning/minskning.</li>
                    <li>Test 4: 14 punkter i rad som alternerar upp och ner.</li>
                    <li>Test 5: 2 av 3 punkter utanför 2-sigma (samma sida).</li>
                    <li>Test 6: 4 av 5 punkter utanför 1-sigma (samma sida).</li>
                    <li>Test 7: 15 punkter i rad inom 1-sigma (hugging the center line).</li>
                    <li>Test 8: 8 punkter i rad utanför 1-sigma (mixture pattern).</li>
                  </ul>
                </div>
              </div>
            }
          />
        </div>

        <div className="p-6 border-t border-border bg-muted/30 flex justify-end">
          <Button variant="primary" onClick={onClose}>Jag förstår</Button>
        </div>
      </Card>
    </div>
  );
}

function SopSection({ title, icon, content }: { title: string, icon: React.ReactNode, content: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h3 className="font-black uppercase tracking-wider text-xs">{title}</h3>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed bg-muted/20 p-4 rounded-xl border border-border/50">
        {content}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, status, subValue }: { 
  title: string, 
  value: string, 
  icon: React.ReactNode, 
  status?: 'success' | 'warning' | 'danger',
  subValue?: string
}) {
  const statusClasses = {
    success: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    danger: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    default: 'text-muted-foreground bg-muted border-border'
  };

  const currentStatus = status ? statusClasses[status] : statusClasses.default;

  return (
    <Card className="p-4 md:p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", currentStatus)}>
          {icon}
        </div>
        {status && (
          <div className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border", currentStatus)}>
            {status === 'success' ? 'OK' : status === 'warning' ? 'VARN' : 'KRIT'}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-1">{title}</h4>
        <div className="text-xl md:text-2xl font-black tracking-tight">{value}</div>
        {subValue && <div className="text-[9px] font-bold text-muted-foreground mt-1 uppercase tracking-tighter">{subValue}</div>}
      </div>
    </Card>
  );
}

function getHistogramData(data: ProductionData[], metric: string, binCount: number = 8) {
  if (data.length === 0) return [];
  const values = data.map(d => Number(d[metric] || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binSize = (max - min) / (binCount || 1);
  
  const bins = Array.from({ length: binCount }, (_, i) => ({
    bin: (min + i * binSize).toFixed(1).toString(),
    count: 0
  }));

  values.forEach(v => {
    const binIdx = Math.min(Math.floor((v - min) / (binSize || 1)), binCount - 1);
    if (binIdx >= 0) bins[binIdx].count++;
  });

  return bins;
}
