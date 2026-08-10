import * as Flex from '@twilio/flex-ui';

const collectedConsoleLogs: string[] = [];
const collectedNetworkLogs: string[] = [];

// NEW: Array to store structured HAR entries
const harEntries: any[] = [];

function hookConsoleMethods() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  console.log = (...args: any[]) => {
    const logEntry = `[LOG] ${new Date().toISOString()}: ${args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ')}`;
    collectedConsoleLogs.push(logEntry);
    originalLog.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const logEntry = `[ERROR] ${new Date().toISOString()}: ${args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ')}`;
    collectedConsoleLogs.push(logEntry);
    originalError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const logEntry = `[WARN] ${new Date().toISOString()}: ${args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ')}`;
    collectedConsoleLogs.push(logEntry);
    originalWarn.apply(console, args);
  };

  console.info = (...args: any[]) => {
    const logEntry = `[INFO] ${new Date().toISOString()}: ${args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ')}`;
    collectedConsoleLogs.push(logEntry);
    originalInfo.apply(console, args);
  };
}

// NEW: Helper to extract query params for HAR
function extractQueryParams(url: string): { name: string; value: string }[] {
  try {
    const urlObj = new URL(url);
    return Array.from(urlObj.searchParams.entries()).map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function hookNetworkMethods() {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const startTime = Date.now();
    const startedDateTime = new Date().toISOString();

    const requestEntry = `[NETWORK] ${startedDateTime} REQUEST ${method} ${url}`;
    collectedNetworkLogs.push(requestEntry);

    // NEW: Build HAR request object
    const harRequest = {
      method,
      url,
      httpVersion: 'HTTP/1.1',
      headers: Object.entries(init?.headers || {}).map(([name, value]) => ({
        name,
        value: String(value),
      })),
      queryString: extractQueryParams(url),
      cookies: [],
      headersSize: -1,
      bodySize: init?.body ? String(init.body).length : 0,
    };

    try {
      const response = await originalFetch(input, init);
      const duration = Date.now() - startTime;
      const responseEntry = `[NETWORK] ${new Date().toISOString()} RESPONSE ${method} ${url} -> ${
        response.status
      } (${duration}ms)`;
      collectedNetworkLogs.push(responseEntry);

      // NEW: Build HAR response object
      const responseHeaders: { name: string; value: string }[] = [];
      response.headers.forEach((value, name) => {
        responseHeaders.push({ name, value });
      });

      // NEW: Add HAR entry
      harEntries.push({
        startedDateTime,
        time: duration,
        request: harRequest,
        response: {
          status: response.status,
          statusText: response.statusText,
          httpVersion: 'HTTP/1.1',
          headers: responseHeaders,
          cookies: [],
          content: {
            size: -1,
            mimeType: response.headers.get('content-type') || 'application/octet-stream',
          },
          redirectURL: response.headers.get('location') || '',
          headersSize: -1,
          bodySize: -1,
        },
        cache: {},
        timings: {
          blocked: 0,
          dns: 0,
          connect: 0,
          send: 0,
          wait: duration,
          receive: 0,
          ssl: 0,
        },
      });

      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorEntry = `[NETWORK] ${new Date().toISOString()} ERROR ${method} ${url} -> ${
        error.message
      } (${duration}ms)`;
      collectedNetworkLogs.push(errorEntry);

      // NEW: Add failed HAR entry
      harEntries.push({
        startedDateTime,
        time: duration,
        request: harRequest,
        response: {
          status: 0,
          statusText: error.message || 'FAILED',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          content: {
            size: 0,
            mimeType: 'text/plain',
            text: error.message,
          },
          redirectURL: '',
          headersSize: -1,
          bodySize: -1,
        },
        cache: {},
        timings: {
          blocked: 0,
          dns: 0,
          connect: 0,
          send: 0,
          wait: duration,
          receive: 0,
          ssl: 0,
        },
      });

      throw error;
    }
  };

  const originalXHR = window.XMLHttpRequest;

  window.XMLHttpRequest = class extends originalXHR {
    private _method: string = '';

    private _url: string = '';

    private _startTime: number = 0;

    private _startedDateTime: string = '';

    private _requestHeaders: { name: string; value: string }[] = [];

    open(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      this._method = method;
      this._url = typeof url === 'string' ? url : url.toString();
      this._requestHeaders = [];
      super.open(method, url, async, username ?? null, password ?? null);
    }

    setRequestHeader(name: string, value: string) {
      this._requestHeaders.push({ name, value });
      super.setRequestHeader(name, value);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null) {
      this._startTime = Date.now();
      this._startedDateTime = new Date().toISOString();
      const requestEntry = `[NETWORK] ${this._startedDateTime} REQUEST ${this._method} ${this._url}`;
      collectedNetworkLogs.push(requestEntry);

      // NEW: Build HAR request object
      const harRequest = {
        method: this._method,
        url: this._url,
        httpVersion: 'HTTP/1.1',
        headers: this._requestHeaders,
        queryString: extractQueryParams(this._url),
        cookies: [],
        headersSize: -1,
        bodySize: body ? String(body).length : 0,
      };

      this.addEventListener('load', () => {
        const duration = Date.now() - this._startTime;
        const responseEntry = `[NETWORK] ${new Date().toISOString()} RESPONSE ${this._method} ${this._url} -> ${
          this.status
        } (${duration}ms)`;
        collectedNetworkLogs.push(responseEntry);

        // NEW: Parse response headers for HAR
        const responseHeaders: { name: string; value: string }[] = [];
        const headerText = this.getAllResponseHeaders();
        if (headerText) {
          headerText.split('\r\n').forEach((line) => {
            const [name, ...valueParts] = line.split(':');
            if (name) {
              responseHeaders.push({ name: name.trim(), value: valueParts.join(':').trim() });
            }
          });
        }

        // NEW: Add HAR entry
        harEntries.push({
          startedDateTime: this._startedDateTime,
          time: duration,
          request: harRequest,
          response: {
            status: this.status,
            statusText: this.statusText,
            httpVersion: 'HTTP/1.1',
            headers: responseHeaders,
            cookies: [],
            content: {
              size: -1,
              mimeType: this.getResponseHeader('content-type') || 'application/octet-stream',
            },
            redirectURL: this.getResponseHeader('location') || '',
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: {
            blocked: 0,
            dns: 0,
            connect: 0,
            send: 0,
            wait: duration,
            receive: 0,
            ssl: 0,
          },
        });
      });

      this.addEventListener('error', () => {
        const duration = Date.now() - this._startTime;
        const errorEntry = `[NETWORK] ${new Date().toISOString()} ERROR ${this._method} ${
          this._url
        } -> FAILED (${duration}ms)`;
        collectedNetworkLogs.push(errorEntry);

        // NEW: Add failed HAR entry
        harEntries.push({
          startedDateTime: this._startedDateTime,
          time: duration,
          request: harRequest,
          response: {
            status: 0,
            statusText: 'FAILED',
            httpVersion: 'HTTP/1.1',
            headers: [],
            cookies: [],
            content: {
              size: 0,
              mimeType: 'text/plain',
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: {
            blocked: 0,
            dns: 0,
            connect: 0,
            send: 0,
            wait: duration,
            receive: 0,
            ssl: 0,
          },
        });
      });

      super.send(body);
    }
  };
}

let hooksInitialized = false;
function initializeHooks() {
  if (hooksInitialized) return;
  hooksInitialized = true;
  hookConsoleMethods();
  hookNetworkMethods();
}

// NEW: Generate only console logs content
function generateConsoleLogContent(): string {
  const timestamp = new Date().toISOString();
  let content = `=== Flex Console Logs ===\n`;
  content += `Generated: ${timestamp}\n`;
  content += `User Agent: ${navigator.userAgent}\n`;
  content += `URL: ${window.location.href}\n`;
  content += `====================================\n\n`;
  content += `=== CONSOLE LOGS (${collectedConsoleLogs.length}) ===\n`;
  content += collectedConsoleLogs.join('\n') || 'No console logs captured.\n';
  content += `\n\n`;
  content += `=== END OF LOGS ===\n`;
  return content;
}

// NEW: Generate HAR file content for network logs
function generateHarContent(): string {
  const timestamp = new Date().toISOString();

  const harObject = {
    log: {
      version: '1.2',
      creator: {
        name: 'Twilio Flex Log Collector',
        version: '1.0.0',
      },
      browser: {
        name: navigator.userAgent.split(' ')[0] || 'Unknown',
        version: navigator.userAgent,
      },
      pages: [
        {
          startedDateTime: timestamp,
          id: 'page_1',
          title: document.title || 'Flex App',
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1,
          },
        },
      ],
      entries: harEntries,
    },
  };

  return JSON.stringify(harObject, null, 2);
}

// MODIFIED: Download console log file (.txt)
function downloadConsoleLogFile(logContent: string): string {
  const blob = new Blob([logContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const filename = `flex-console-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}

// NEW: Download network log file as HAR (.har)
function downloadHarFile(harContent: string): string {
  const blob = new Blob([harContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `flex-network-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.har`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}

// MODIFIED: Outlook compose with both filenames
// function openOutlookCompose(consoleFilename: string, harFilename: string): boolean {
//   const subject = encodeURIComponent('Flex Console & Network Logs');
//   const body = encodeURIComponent(
//     `Hi,\n\n` +
//       `Please find the attached log files:\n` +
//       `1. Console Logs: ${consoleFilename}\n` +
//       `2. Network Logs (HAR): ${harFilename}\n\n` +
//       `Both files have been downloaded to your Downloads folder.\n` +
//       `Please click the attachment icon (📎) in Outlook and select these files.\n\n` +
//       `---\n` +
//       `Logs collected at: ${new Date().toISOString()}\n` +
//       `Console Logs: ${collectedConsoleLogs.length}\n` +
//       `Network Logs: ${collectedNetworkLogs.length}\n` +
//       `HAR Entries: ${harEntries.length}\n\n`,
//   );

//   const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;

//   const outlookWindow = window.open(mailtoUrl, '_blank');

//   if (!outlookWindow || outlookWindow.closed || typeof outlookWindow.closed === 'undefined') {
//     return false;
//   }
//   return true;
// }
function openOutlookCompose(
  consoleFilename: string,
  harFilename: string,
  ccEmails: string[] = [],
  bccEmails: string[] = [],
): boolean {
    console.log("ccEmails------",ccEmails)
  const subject = encodeURIComponent(`Flex Console & Network Logs`);
  const body = encodeURIComponent(
    `Hi,\n\n` +
      `Please find the attached log files:\n` +
      `1. Console Logs: ${consoleFilename}\n` +
      `2. Network Logs (HAR): ${harFilename}\n\n` +
      `Both files have been downloaded to your Downloads folder.\n` +
      `Please click the attachment icon (📎) in Outlook and select these files.\n\n` +
      `---\n` +
      `Logs collected at: ${new Date().toISOString()}\n` +
      `Console Logs: ${collectedConsoleLogs.length}\n` +
      `Network Logs: ${collectedNetworkLogs.length}\n` +
      `HAR Entries: ${harEntries.length}\n\n`,
  );

  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', body);
  if (ccEmails.length > 0) {
    params.set('cc', ccEmails.join(','));
  }
  if (bccEmails.length > 0) {
    params.set('bcc', bccEmails.join(','));
  }

  // URLSearchParams double-encodes subject/body since they're already encoded — build manually instead
  const parts = [`subject=${subject}`, `body=${body}`];
  if (ccEmails.length > 0) parts.push(`cc=${encodeURIComponent(ccEmails.join(','))}`);
  if (bccEmails.length > 0) parts.push(`bcc=${encodeURIComponent(bccEmails.join(','))}`);

  const mailtoUrl = `mailto:?${parts.join('&')}`;

  const a = document.createElement('a');
  a.href = mailtoUrl;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  return true;
}

export const actionName = 'CollectAndEmailLogs';
export const actionHook = function registerCollectAndEmailLogs(flex: typeof Flex) {
  initializeHooks();

  flex.Actions.registerAction('CollectAndEmailLogs', async () => {
    try {
      const consoleLogContent = generateConsoleLogContent();
      const harContent = generateHarContent();
      const consoleFilename = downloadConsoleLogFile(consoleLogContent);
      const harFilename = downloadHarFile(harContent);

      // NEW: pull cc/bcc lists from the deployed feature config
     const manager = flex.Manager.getInstance();
    const sc = manager.serviceConfiguration as any;

    // Try common paths first
    let globalConfig =
      sc?.ui_attributes?.custom_data?.features?.error_monitoring ||
      sc?.ui_attributes?.features?.error_monitoring ||
      sc?.custom_data?.features?.error_monitoring ||
      sc?.attributes?.features?.error_monitoring ||
      null;

    // If not found, search recursively through the entire serviceConfiguration
    if (!globalConfig) {
      const findByKey = (obj: any, targetKey: string): any => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj[targetKey]) return obj[targetKey];
        for (const key of Object.keys(obj)) {
          const result = findByKey(obj[key], targetKey);
          if (result) return result;
        }
        return null;
      };
      globalConfig = findByKey(sc, 'error_monitoring') || {};
    }
     const workerConfig = manager.workerClient?.attributes?.error_monitoring || {};

      // 3. Merge global + worker, deduplicate with Set
      const ccEmails: string[] = [
        ...new Set([
          ...(globalConfig.cc_emails || []),
          ...(workerConfig.cc_emails || []),
        ]),
      ];

      const bccEmails: string[] = [
        ...new Set([
          ...(globalConfig.bcc_emails || []),
          ...(workerConfig.bcc_emails || []),
        ]),
      ];
    
        console.log('globalConfig found:', globalConfig);
         console.log('workerConfig found:', workerConfig);
    console.log('CC Emails:', ccEmails);
    console.log('BCC Emails:', bccEmails);

      const outlookOpened = openOutlookCompose(consoleFilename, harFilename, ccEmails, bccEmails);

      if (outlookOpened) {
        flex.Notifications.showNotification('logsCollected', {
          content: `📄 Console logs: "${consoleFilename}"\n📊 Network logs (HAR): "${harFilename}"\n\nBoth downloaded! Please attach them from your Downloads folder to the Outlook email.`,
          type: flex.NotificationType.success,
        });
      }
    } catch (error) {
      console.error('Failed to collect logs:', error);
      flex.Notifications.showNotification('logsCollectError', {
        content: 'Failed to collect logs. Please try again.',
        type: flex.NotificationType.error,
      });
    }
  });
};
