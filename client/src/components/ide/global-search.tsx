import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Replace, X, ChevronDown, ChevronRight, FileText, MoreHorizontal } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SearchResult {
  fileId: number;
  fileName: string;
  filePath: string;
  matches: {
    line: number;
    column: number;
    text: string;
    matchText: string;
    beforeText: string;
    afterText: string;
  }[];
}

interface GlobalSearchProps {
  projectId: number;
  onFileSelect: (fileId: number, line?: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ projectId, onFileSelect, isOpen, onClose }: GlobalSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
  const [selectedResult, setSelectedResult] = useState<{fileId: number, matchIndex: number} | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Fetch project files for search
  const { data: files = [] } = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/projects/${projectId}/files`);
      return response as any[];
    },
    enabled: !!projectId,
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async ({ query, options }: { query: string, options: any }) => {
      return apiRequest('POST', `/api/projects/${projectId}/search`, {
        query,
        caseSensitive: options.caseSensitive,
        wholeWord: options.wholeWord,
        useRegex: options.useRegex
      });
    },
    onSuccess: (results: SearchResult[]) => {
      setSearchResults(results);
      setIsSearching(false);
      
      // Auto-expand files with results
      const filesWithResults = new Set(results.map(r => r.fileId));
      setExpandedFiles(filesWithResults);
    },
    onError: (error: any) => {
      setIsSearching(false);
      toast({
        title: 'Search Error',
        description: error.message || 'Failed to search files',
        variant: 'destructive'
      });
    },
  });

  // Replace mutation
  const replaceMutation = useMutation({
    mutationFn: async ({ fileId, replacements }: { fileId: number, replacements: any[] }) => {
      return apiRequest('POST', `/api/files/${fileId}/replace`, {
        replacements
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      toast({
        title: 'Replace Complete',
        description: 'Text replaced successfully',
      });
      // Re-run search to update results
      if (searchQuery) {
        handleSearch();
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Replace Error',
        description: error.message || 'Failed to replace text',
        variant: 'destructive'
      });
    },
  });

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchMutation.mutate({
      query: searchQuery,
      options: {
        caseSensitive,
        wholeWord,
        useRegex
      }
    });
  }, [searchQuery, caseSensitive, wholeWord, useRegex, searchMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSearch, onClose]);

  const toggleFileExpansion = useCallback((fileId: number) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  }, []);

  const handleResultClick = useCallback((fileId: number, line?: number, matchIndex?: number) => {
    onFileSelect(fileId, line);
    if (matchIndex !== undefined) {
      setSelectedResult({ fileId, matchIndex });
    }
  }, [onFileSelect]);

  const handleReplaceInFile = useCallback((fileId: number, matches: any[]) => {
    if (!replaceQuery) return;

    const replacements = matches.map(match => ({
      line: match.line,
      column: match.column,
      oldText: match.matchText,
      newText: replaceQuery
    }));

    replaceMutation.mutate({ fileId, replacements });
  }, [replaceQuery, replaceMutation]);

  const handleReplaceAll = useCallback(() => {
    if (!replaceQuery) return;

    searchResults.forEach(result => {
      handleReplaceInFile(result.fileId, result.matches);
    });
  }, [searchResults, replaceQuery, handleReplaceInFile]);

  const getTotalMatches = useCallback(() => {
    return searchResults.reduce((total, result) => total + result.matches.length, 0);
  }, [searchResults]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-96 bg-slate-800 border-r border-slate-700 flex flex-col z-40">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-200 flex items-center">
            <Search className="w-4 h-4 mr-2" />
            Search & Replace
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* Search Input */}
        <div className="space-y-2">
          <div className="relative">
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search across all files..."
              className="bg-slate-700 border-slate-600 text-gray-200 pr-10"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
              onClick={handleSearch}
              disabled={isSearching}
            >
              <Search className="w-3 h-3" />
            </Button>
          </div>

          {/* Replace Input */}
          {showReplace && (
            <div className="relative">
              <Input
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Replace with..."
                className="bg-slate-700 border-slate-600 text-gray-200 pr-10"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
                onClick={handleReplaceAll}
                disabled={!replaceQuery || searchResults.length === 0}
                title="Replace All"
              >
                <Replace className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Search Options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant={caseSensitive ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setCaseSensitive(!caseSensitive)}
                title="Match Case"
              >
                Aa
              </Button>
              <Button
                variant={wholeWord ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setWholeWord(!wholeWord)}
                title="Match Whole Word"
              >
                Ab
              </Button>
              <Button
                variant={useRegex ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setUseRegex(!useRegex)}
                title="Use Regular Expression"
              >
                .*
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
              onClick={() => setShowReplace(!showReplace)}
              title="Toggle Replace"
            >
              <Replace className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Results Summary */}
        {searchResults.length > 0 && (
          <div className="mt-3 text-xs text-gray-400">
            {getTotalMatches()} results in {searchResults.length} files
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <div className="text-sm text-gray-400">Searching...</div>
            </div>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="p-2">
            {searchResults.map((result) => (
              <div key={result.fileId} className="mb-2">
                {/* File Header */}
                <div
                  className="flex items-center p-2 hover:bg-slate-700 rounded cursor-pointer"
                  onClick={() => toggleFileExpansion(result.fileId)}
                >
                  {expandedFiles.has(result.fileId) ? (
                    <ChevronDown className="w-3 h-3 mr-1 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 mr-1 text-gray-400" />
                  )}
                  <FileText className="w-3 h-3 mr-2 text-blue-400" />
                  <span className="text-sm text-gray-200 flex-1">{result.fileName}</span>
                  <span className="text-xs text-gray-500 mr-2">
                    {result.matches.length} match{result.matches.length !== 1 ? 'es' : ''}
                  </span>
                  {showReplace && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-gray-400 hover:text-gray-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplaceInFile(result.fileId, result.matches);
                      }}
                      title="Replace in this file"
                    >
                      <Replace className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* Matches */}
                {expandedFiles.has(result.fileId) && (
                  <div className="ml-6 space-y-1">
                    {result.matches.map((match, matchIndex) => (
                      <div
                        key={matchIndex}
                        className={`p-2 rounded text-xs cursor-pointer hover:bg-slate-700 ${
                          selectedResult?.fileId === result.fileId && selectedResult?.matchIndex === matchIndex
                            ? 'bg-slate-600'
                            : ''
                        }`}
                        onClick={() => handleResultClick(result.fileId, match.line, matchIndex)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-400">Line {match.line}:{match.column}</span>
                        </div>
                        <div className="font-mono text-gray-300 whitespace-pre-wrap break-all">
                          <span className="text-gray-500">{match.beforeText}</span>
                          <span className="bg-yellow-500 text-black px-1 rounded">
                            {match.matchText}
                          </span>
                          <span className="text-gray-500">{match.afterText}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : searchQuery && !isSearching ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <div className="text-sm">No results found</div>
              <div className="text-xs text-gray-500 mt-1">
                Try different search terms or options
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <div className="text-center text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <div className="text-sm">Search across all files</div>
              <div className="text-xs text-gray-500 mt-1">
                Use Ctrl+Shift+F to open search
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-slate-700 text-xs text-gray-500 shrink-0">
        <div className="flex items-center justify-between">
          <span>
            {searchResults.length > 0 && `${getTotalMatches()} matches`}
          </span>
          <span>
            Ctrl+Shift+F • Enter to search • Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}