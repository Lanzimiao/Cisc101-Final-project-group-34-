/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { 
  MessageSquare,
  Send,
  BookOpen, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  HelpCircle,
  FileText,
  BrainCircuit,
  ChevronRight,
  History,
  Copy,
  Upload,
  File,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

type SubjectType = 'humanities' | 'sciences' | 'unknown';
type QuestionType = 'multiple choice' | 'short answer' | 'mixed';

interface QuizStep {
  id: number;
  label: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
}

interface UploadedFile {
  name: string;
  mimeType: string;
  base64: string;
  preview?: string;
}

export default function App() {
  const [input, setInput] = useState('');
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [subject, setSubject] = useState<SubjectType>('unknown');
  const [concepts, setConcepts] = useState<string[]>([]);
  const [quizOutput, setQuizOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType | null>(null);
  const [showTypeSelection, setShowTypeSelection] = useState(false);
  const [history, setHistory] = useState<{input: string, output: string}[]>([]);
  const [qaHistory, setQaHistory] = useState<{question: string, answer: string}[]>([]);
  const [userQuestion, setUserQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qaEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    qaEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const steps: QuizStep[] = [
    { id: 1, label: 'Analyze Material', status: currentStep >= 1 ? 'completed' : currentStep === 0 && isProcessing ? 'loading' : 'pending' },
    { id: 2, label: 'Extract Concepts', status: currentStep >= 2 ? 'completed' : currentStep === 1 ? 'loading' : 'pending' },
    { id: 3, label: 'Generate Basic Questions', status: currentStep >= 3 ? 'completed' : currentStep === 2 ? 'loading' : 'pending' },
    { id: 4, label: 'Generate Advanced Questions', status: currentStep >= 4 ? 'completed' : currentStep === 3 ? 'loading' : 'pending' },
    { id: 5, label: 'Final Formatting', status: currentStep >= 5 ? 'completed' : currentStep === 4 ? 'loading' : 'pending' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setFile({
        name: selectedFile.name,
        mimeType: selectedFile.type,
        base64: base64,
        preview: selectedFile.type.startsWith('image/') ? URL.createObjectURL(selectedFile) : undefined
      });
      setInput(''); // Clear text input if file is uploaded
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleStartGeneration = async () => {
    if (!input.trim() && !file) {
      setError('Please provide study materials (text or file).');
      return;
    }
    setError(null);
    setIsProcessing(true);
    setCurrentStep(0);
    setQuizOutput('');
    setQaHistory([]);
    setShowTypeSelection(true);
  };

  const handleAskQuestion = async () => {
    if (!userQuestion.trim() || isAsking) return;
    
    const question = userQuestion;
    setUserQuestion('');
    setIsAsking(true);
    
    try {
      const model = "gemini-3-flash-preview";
      const parts: any[] = [];
      
      if (file) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.base64
          }
        });
      }
      
      const prompt = `
        You are an expert tutor. Answer the user's question based ONLY on the provided study materials.
        If the answer is not in the materials, say "I'm sorry, but that information is not covered in the provided study materials."
        
        Study Materials:
        ${input ? input : 'Provided in the attached file.'}
        
        User Question: ${question}
        
        Answer concisely and use LaTeX for any math.
      `;
      
      parts.push({ text: prompt });
      
      const response = await genAI.models.generateContent({
        model,
        contents: { parts },
      });
      
      const answer = response.text || "I couldn't generate an answer.";
      setQaHistory(prev => [...prev, { question, answer }]);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error(err);
      setQaHistory(prev => [...prev, { question, answer: "Sorry, I encountered an error while answering your question." }]);
    } finally {
      setIsAsking(false);
    }
  };

  const generateQuiz = async (selectedType: QuestionType) => {
    setQuestionType(selectedType);
    setShowTypeSelection(false);
    
    try {
      const model = "gemini-3-flash-preview";
      
      // Step 1 & 2: Identify Subject and Extract Concepts
      setCurrentStep(1);
      
      const parts: any[] = [];
      if (file) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.base64
          }
        });
      }
      
      const promptText = `Follow this structured process strictly:
      Step 1: Identify whether the subject belongs to humanities or sciences.
      Step 2: Extract the key concepts from the study materials.
      
      VALIDATION RULES:
      If the input study materials are unclear, incomplete, contradictory, or empty:
      STOP and respond ONLY with a JSON object containing "clarification": "[reason]".
      Do NOT make assumptions.
      
      CLASSIFICATION LOGIC:
      - Humanities: Focus on concepts, interpretation, and explanations.
      - Sciences: Focus on definitions, logical reasoning, and problem understanding.
      
      ${input ? `Text Materials: ${input}` : 'Material is provided in the attached file.'}`;

      parts.push({ text: promptText });

      const step1Response = await genAI.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING, enum: ['humanities', 'sciences'] },
              concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
              clarification: { type: Type.STRING, description: "Only if clarification is required" }
            },
            required: ["subject", "concepts"]
          }
        }
      });

      const step1Data = JSON.parse(step1Response.text || '{}');
      
      if (step1Data.clarification || step1Response.text.includes("CLARIFICATION_REQUIRED")) {
        setError(step1Data.clarification || "The study materials are unclear. Please provide more detail.");
        setIsProcessing(false);
        return;
      }

      setSubject(step1Data.subject);
      setConcepts(step1Data.concepts);
      
      // Step 3 & 4 & 5: Generate Questions
      setCurrentStep(2);
      setCurrentStep(3); 
      
      const finalParts: any[] = [];
      if (file) {
        finalParts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.base64
          }
        });
      }

      const finalPrompt = `
      Follow this structured process strictly:
      Step 1: Subject identified as ${step1Data.subject}.
      Step 2: Key concepts extracted: ${step1Data.concepts.join(', ')}.
      
      Now perform:
      Step 3: Generate basic (easy) questions based on these concepts.
      Step 4: Generate more difficult questions based on the same concepts.
      Step 5: Format the output as a numbered list.
      
      FEW-SHOT EXAMPLES:
      Example 1 (Humanities):
      Input: The Renaissance was a cultural movement that emphasized humanism, art, and scientific inquiry.
      Output:
      Q1:
      What was the Renaissance?

      Q2:
      What were the main features of the Renaissance?

      Q3:
      Why was humanism important during the Renaissance?

      Example 2 (Humanities):
      Input: The Western Roman Empire fell in 476 CE due to internal weaknesses and external invasions.
      Output:
      Q1:
      What were the main causes of the fall of the Western Roman Empire?
      A. Scientific discoveries and technological progress
      B. Political instability, economic decline, and external invasions
      C. Expansion of trade routes and economic growth
      D. Religious unity and strong leadership

      Example 3 (Sciences):
      Input: The Cartesian product of two sets A and B is the set of all ordered pairs (a, b).
      Output:
      Q1:
      If A = {1, 2} and B = {x, y}, list all elements of $A \times B$.

      Example 4 (Sciences):
      Input: Pseudocode uses structured steps to represent algorithms.
      Output:
      Q1:
      Write pseudocode to calculate the sum of numbers from 1 to 5 using a loop.

      DIFFICULTY CONTROL:
      - Start with basic questions, then move to more difficult ones.
      - Basic questions test definitions or direct understanding.
      - Advanced questions require reasoning or application.
      - Difficulty progression must be clear and not mixed.
      
      RULES:
      - Subject: ${step1Data.subject}
      - Question Type: ${selectedType}
      - Each question must start with Q[number]:
      - The question content must follow on the next line after Q[number]:
      - Each question must be separated by exactly ONE blank line.
      - Do not compress spacing.
      - Do not merge questions.
      - If the user shows confusion or requests help: Help users to understand how to solve the question.
      
      MATH FORMATTING RULES:
      - All math expressions must use LaTeX.
      - Inline math: $...$
      - Display math: $$...$$
      - No plain text math.
      - No code blocks for math.
      
      ${input ? `Text Materials: ${input}` : 'Materials are in the attached file.'}
      
      Output the final numbered list of questions.
      `;

      finalParts.push({ text: finalPrompt });

      const finalResponse = await genAI.models.generateContent({
        model,
        contents: { parts: finalParts },
      });

      setQuizOutput(finalResponse.text || '');
      setCurrentStep(5);
      setHistory(prev => [{ input: (file ? `File: ${file.name}` : input.slice(0, 50) + '...'), output: finalResponse.text || '' }, ...prev]);
    } catch (err) {
      console.error(err);
      setError('An error occurred during generation. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(quizOutput);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-orange-200">
      {/* Header */}
      <header className="border-b border-black/10 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
              <BrainCircuit size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">QuizGenie</h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-black/60">
            <button className="hover:text-black transition-colors flex items-center gap-1">
              <History size={16} />
              History
            </button>
            <div className="h-4 w-[1px] bg-black/10" />
            <span>v1.5</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Input & Steps */}
          <div className="lg:col-span-5 space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm uppercase tracking-wider">
                  <FileText size={16} />
                  <span>Study Materials</span>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold flex items-center gap-1 text-black/60 hover:text-orange-500 transition-colors"
                >
                  <Upload size={14} />
                  Upload File
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".pdf,.txt,image/*"
                />
              </div>

              {file ? (
                <div className="bg-white p-4 rounded-2xl border-2 border-orange-500 shadow-sm flex items-center gap-4 relative group">
                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500 overflow-hidden">
                    {file.preview ? (
                      <img src={file.preview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <File size={24} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{file.name}</p>
                    <p className="text-xs text-black/40 uppercase">{file.mimeType.split('/')[1]}</p>
                  </div>
                  <button 
                    onClick={() => setFile(null)}
                    className="p-1 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-black/20"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="relative group">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Paste your notes here, or upload a file above..."
                    className="w-full h-64 p-6 bg-white border border-black/10 rounded-2xl shadow-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all resize-none text-lg leading-relaxed"
                    disabled={isProcessing}
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-black/40 font-mono">
                    {input.length} characters
                  </div>
                </div>
              )}
              
              <button
                onClick={handleStartGeneration}
                disabled={isProcessing || (!input.trim() && !file)}
                className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-orange-600 transition-all disabled:opacity-50 disabled:hover:bg-black group"
              >
                {isProcessing ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    Generate Quiz
                    <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </section>

            {/* Steps Progress */}
            <section className="bg-white p-6 rounded-2xl border border-black/10 shadow-sm space-y-6">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <CheckCircle2 size={20} className="text-orange-500" />
                Process Status
              </h3>
              <div className="space-y-4">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                      step.status === 'completed' ? 'bg-orange-500 border-orange-500 text-white' :
                      step.status === 'loading' ? 'border-orange-500 text-orange-500' :
                      'border-black/10 text-black/20'
                    }`}>
                      {step.status === 'completed' ? <CheckCircle2 size={16} /> : step.id}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${step.status === 'pending' ? 'text-black/20' : 'text-black'}`}>
                        {step.label}
                      </p>
                      {step.status === 'loading' && (
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          className="h-1 bg-orange-500/20 rounded-full mt-1 overflow-hidden"
                        >
                          <motion.div 
                            animate={{ x: ['-100%', '100%'] }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                            className="h-full w-1/3 bg-orange-500 rounded-full"
                          />
                        </motion.div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {showTypeSelection ? (
                <motion.div
                  key="selection"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white p-8 rounded-3xl border-2 border-orange-500 shadow-xl space-y-8"
                >
                  <div className="text-center space-y-2">
                    <HelpCircle size={48} className="mx-auto text-orange-500" />
                    <h2 className="text-2xl font-bold">Choose Question Type</h2>
                    <p className="text-black/60">Select how you want the questions to be formatted.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {(['multiple choice', 'short answer', 'mixed'] as QuestionType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => generateQuiz(type)}
                        className="p-6 border border-black/10 rounded-2xl text-left hover:border-orange-500 hover:bg-orange-50 transition-all group flex items-center justify-between"
                      >
                        <div>
                          <span className="block font-bold text-lg capitalize">{type}</span>
                          <span className="text-sm text-black/40">
                            {type === 'multiple choice' ? 'A, B, C, D options for each question' :
                             type === 'short answer' ? 'Open-ended questions for deep recall' :
                             'A blend of both formats'}
                          </span>
                        </div>
                        <ChevronRight className="text-black/20 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : quizOutput ? (
                <motion.div
                  key="output"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-3xl border border-black/10 shadow-sm overflow-hidden"
                >
                  <div className="bg-black text-white p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BookOpen size={20} />
                      <span className="font-bold">Generated Quiz</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        subject === 'humanities' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                      }`}>
                        {subject}
                      </span>
                      <button 
                        onClick={() => {
                          setQuizOutput('');
                          setInput('');
                          setFile(null);
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="p-8 prose prose-orange max-w-none">
                    <div className="text-lg leading-relaxed text-black/80">
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                      >
                        {quizOutput}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Q&A Section */}
                  <div className="border-t border-black/10 p-8 bg-orange-50/30">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-6">
                      <MessageSquare size={20} className="text-orange-500" />
                      Ask about the material
                    </h3>
                    
                    <div className="space-y-6 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {qaHistory.length === 0 && !isAsking && (
                        <p className="text-center text-black/30 py-8 italic">
                          Have questions about the content? Ask them below.
                        </p>
                      )}
                      {qaHistory.map((item, idx) => (
                        <div key={idx} className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                          <div className="flex gap-3 justify-end">
                            <div className="bg-orange-500 text-white px-4 py-2 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-sm">
                              {item.question}
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white border border-black/10 flex items-center justify-center flex-shrink-0 shadow-sm">
                              <BrainCircuit size={18} className="text-orange-500" />
                            </div>
                            <div className="bg-white border border-black/10 px-4 py-3 rounded-2xl rounded-tl-none text-sm max-w-[85%] shadow-sm prose prose-sm prose-orange">
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {item.answer}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      ))}
                      {isAsking && (
                        <div className="flex gap-3 animate-pulse">
                          <div className="w-8 h-8 rounded-xl bg-white border border-black/10 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <BrainCircuit size={18} className="text-orange-500" />
                          </div>
                          <div className="bg-white border border-black/10 px-4 py-3 rounded-2xl rounded-tl-none text-sm shadow-sm flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-orange-500" />
                            <span className="text-black/40">Thinking...</span>
                          </div>
                        </div>
                      )}
                      <div ref={qaEndRef} />
                    </div>

                    <div className="relative group">
                      <input
                        type="text"
                        value={userQuestion}
                        onChange={(e) => setUserQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                        placeholder="Ask a follow-up question..."
                        className="w-full pl-6 pr-14 py-4 bg-white border border-black/10 rounded-2xl shadow-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-sm"
                        disabled={isAsking}
                      />
                      <button
                        onClick={handleAskQuestion}
                        disabled={isAsking || !userQuestion.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-black text-white rounded-xl hover:bg-orange-600 transition-all disabled:opacity-50 disabled:hover:bg-black"
                      >
                        {isAsking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="p-6 bg-black/5 border-t border-black/10 flex justify-end gap-3">
                    <button 
                      onClick={copyToClipboard}
                      className="px-4 py-2 text-sm font-bold border border-black/10 rounded-lg hover:bg-white transition-colors flex items-center gap-2"
                    >
                      <Copy size={16} />
                      Copy to Clipboard
                    </button>
                  </div>
                </motion.div>
              ) : error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-50 border-2 border-red-200 p-8 rounded-3xl text-center space-y-4"
                >
                  <AlertCircle size={48} className="mx-auto text-red-500" />
                  <h3 className="text-xl font-bold text-red-900">Clarification Required</h3>
                  <p className="text-red-700">{error}</p>
                  <button 
                    onClick={() => setError(null)}
                    className="px-6 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors"
                  >
                    Try Again
                  </button>
                </motion.div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-black/10 rounded-3xl">
                  <div className="w-20 h-20 bg-black/5 rounded-full flex items-center justify-center mb-6">
                    <BrainCircuit size={40} className="text-black/20" />
                  </div>
                  <h3 className="text-xl font-bold text-black/40 mb-2">Ready to Generate</h3>
                  <p className="text-black/30 max-w-xs">
                    Paste your study materials or upload a file (PDF, Image, Text) to start the process.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-black/10 text-center text-black/40 text-sm">
        <p>© 2026 QuizGenie • Powered by Google AI Studio</p>
      </footer>
    </div>
  );
}
