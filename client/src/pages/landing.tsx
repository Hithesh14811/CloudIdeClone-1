import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, FileText, Zap, Users, Brain, Terminal } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <header className="text-center mb-16">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mr-3">
              <Code className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold">Shetty</h1>
          </div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            A powerful cloud IDE platform for building, collaborating, and deploying your projects anywhere, anytime.
          </p>
        </header>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mb-2">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <CardTitle className="text-white">File Management</CardTitle>
              <CardDescription>
                Complete project workspace with file explorer, syntax highlighting, and intelligent code completion.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mb-2">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <CardTitle className="text-white">AI Assistant</CardTitle>
              <CardDescription>
                Get help building, debugging, and optimizing your code with our integrated AI assistant.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center mb-2">
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <CardTitle className="text-white">Live Preview</CardTitle>
              <CardDescription>
                See your changes instantly with integrated terminal and live preview functionality.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Card className="bg-slate-800/50 border-slate-700 max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-white text-2xl mb-2">Ready to Start Coding?</CardTitle>
              <CardDescription className="mb-6">
                Join thousands of developers building amazing projects with Shetty.
              </CardDescription>
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
              >
                Sign in to Get Started
              </Button>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
