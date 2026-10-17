# Invoked as trusted inline source by process-tree.cjs, not through a shell command builder.
# No ExecutionPolicy change, credentials, network calls or process-name termination.
$ErrorActionPreference = 'Stop'
$spec = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:LAB_OWNED_SPEC)) | ConvertFrom-Json
Remove-Item Env:LAB_OWNED_SPEC
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
public static class LabOwnedJob {
 [StructLayout(LayoutKind.Sequential)] struct IO { public ulong r1,w1,o1,r2,w2,o2; }
 [StructLayout(LayoutKind.Sequential)] struct BASIC { public long time1,time2; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct LIMIT { public BASIC basic; public IO io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct START { public uint size; public string reserved,desktop,title; public uint x,y,xs,ys,xc,yc,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct INFO { public IntPtr process,thread; public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential)] struct SECURITY { public uint size; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attr,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref LIMIT data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref START startup,out INFO info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFileW(string name,uint access,uint share,ref SECURITY security,uint disposition,uint flags,IntPtr template);
 static void Check(bool value,string message) { if(!value)throw new InvalidOperationException(message+" win32="+Marshal.GetLastWin32Error()); }
 // CommandLineToArgvW / Node CRT escaping; never cmd.exe interpolation.
 static string Quote(string value) {
  StringBuilder b=new StringBuilder("\"");int slash=0;
  foreach(char c in value) { if(c=='\\'){slash++;continue;} if(c=='"')b.Append('\\',slash*2+1);else b.Append('\\',slash);b.Append(c);slash=0; }
  b.Append('\\',slash*2);return b.Append('"').ToString();
 }
 public static int Run(string exe,string[] args,string cwd,int parentId,long parentTicks) {
  IntPtr job=IntPtr.Zero,nul=IntPtr.Zero;INFO info=new INFO();bool assigned=false;
  try {
   using(Process parent=Process.GetProcessById(parentId)) {
    if(parent.StartTime.ToUniversalTime().Ticks!=parentTicks)throw new InvalidOperationException("LAB_PARENT_IDENTITY_CHANGED");
    job=CreateJobObjectW(IntPtr.Zero,null);Check(job!=IntPtr.Zero,"LAB_JOB_CREATE_FAILED");
    LIMIT limits=new LIMIT();limits.basic.flags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(LIMIT))),"LAB_JOB_LIMIT_FAILED");
    SECURITY security=new SECURITY();security.size=(uint)Marshal.SizeOf(typeof(SECURITY));security.inherit=true;
    nul=CreateFileW("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero);Check(nul!=new IntPtr(-1),"LAB_NUL_FAILED");
    START start=new START();start.size=(uint)Marshal.SizeOf(typeof(START));start.flags=0x100;start.input=nul;start.output=GetStdHandle(-11);start.error=GetStdHandle(-12);
    StringBuilder command=new StringBuilder(Quote(exe));foreach(string a in args)command.Append(' ').Append(Quote(a));
    Check(CreateProcessW(exe,command,IntPtr.Zero,IntPtr.Zero,true,4,IntPtr.Zero,cwd,ref start,out info),"LAB_PROCESS_CREATE_FAILED");
    // Suspended until assigned: no unowned child can start spawning descendants.
    Check(AssignProcessToJobObject(job,info.process),"LAB_JOB_ASSIGN_FAILED");assigned=true;
    Check(ResumeThread(info.thread)!=0xffffffff,"LAB_PROCESS_RESUME_FAILED");
    Task<string> input=Console.In.ReadLineAsync();
    while(WaitForSingleObject(info.process,50)==258) {
     if(parent.HasExited||input.IsCompleted) { Check(TerminateJobObject(job,130),"LAB_JOB_STOP_FAILED");WaitForSingleObject(info.process,5000);return 130; }
    }
    uint code;Check(GetExitCodeProcess(info.process,out code),"LAB_PROCESS_STATUS_FAILED");return (int)code;
   }
  } finally {
   // Also removes descendants when root exits unexpectedly or supervisor exits.
   if(job!=IntPtr.Zero)CloseHandle(job);
   if(info.process!=IntPtr.Zero) { if(!assigned)TerminateProcess(info.process,1);CloseHandle(info.process); }
   if(info.thread!=IntPtr.Zero)CloseHandle(info.thread);
   if(nul!=IntPtr.Zero&&nul!=new IntPtr(-1))CloseHandle(nul);
  }
 }
}
'@
# Read the exact Windows start timestamp here; the parent is still alive while its stdin stays open.
$parentProcess = [Diagnostics.Process]::GetProcessById([int]$spec.parent)
$parentTicks = $parentProcess.StartTime.ToUniversalTime().Ticks
$code = [LabOwnedJob]::Run([string]$spec.exe, [string[]]$spec.args, [string]$spec.cwd, [int]$spec.parent, $parentTicks)

exit $code
