import { Link } from 'react-router-dom';
import LegalLayout from '../../components/LegalLayout';
import { SITE } from '../../lib/site';

export default function Security() {
  return (
    <LegalLayout
      title="Security — how FileForge protects your files"
      description="Client-side processing, sandboxed conversion, encryption in transit, and how quickly files are deleted."
      path="/security"
      heading="Security"
      intro="This page describes the controls that actually protect a file you give us. It doubles as our record of reasonable security practices under the IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules 2011."
    >
      <h2>The strongest control: not receiving the file</h2>
      <p>
        Merging, splitting, rotating, reordering and image conversion run inside your browser using
        WebAssembly. The file is read from your disk into your own browser’s memory, and the result
        is produced there. Nothing is transmitted. You can verify this yourself — open your
        browser’s developer tools, watch the network tab, and run a merge. There is no upload
        request to see.
      </p>
      <p>
        Some conversions genuinely cannot work that way: Ghostscript compression, LibreOffice
        rendering and the finance parsers have no browser equivalent. For those the controls below
        apply.
      </p>

      <h2>In transit</h2>
      <p>
        Everything is served over HTTPS with TLS, HSTS with preload, and a strict Content Security
        Policy. Downloads are always served as attachments with content sniffing disabled, so a
        converted file can never be rendered as active content in our own origin.
      </p>

      <h2>At rest, briefly</h2>
      <ul>
        <li>Files live on a local volume mounted <code>noexec</code> and <code>nosuid</code>.</li>
        <li>
          Ordinary conversions are deleted after {SITE.retention.standardMinutes} minutes; finance
          documents after {SITE.retention.financeMinutes} minutes, or the instant you download the
          result.
        </li>
        <li>Failed jobs are deleted after {SITE.retention.failedMinutes} minutes.</li>
        <li>
          A sweep runs every five minutes. It deletes expired jobs, and separately removes any
          directory with no matching live job — so a crashed worker cannot leave a file behind.
        </li>
        <li>
          You can delete anything immediately with the button on the result panel; there is no wait.
        </li>
      </ul>

      <h2>What we check before converting anything</h2>
      <ol>
        <li>The extension must be one the tool accepts.</li>
        <li>
          The file’s actual bytes must match. We identify the format from its magic bytes and ignore
          what the browser claims it is, so a script renamed to <code>.pdf</code> is rejected.
        </li>
        <li>The size is capped per tool and enforced while the upload streams, not after.</li>
        <li>
          The filename is discarded and regenerated. Path separators, NUL bytes and unicode
          right-to-left override characters therefore have nothing to act on.
        </li>
        <li>
          Office documents are zip archives, so we read the index and reject anything that expands
          implausibly or contains an entry escaping its own directory.
        </li>
        <li>A PDF must be structurally valid before any heavier engine sees it.</li>
        <li>PDFs over 500 pages are refused rather than allowed to exhaust the server.</li>
      </ol>

      <h2>How conversion engines are contained</h2>
      <ul>
        <li>
          Engines are started with an argument array and never through a shell, so a filename cannot
          become a command.
        </li>
        <li>Each runs as a non-root user, in a container with capabilities dropped.</li>
        <li>
          Each has a hard memory ceiling and a wall-clock timeout. A malformed file that sends a
          converter into an allocation loop kills that job, not the server.
        </li>
        <li>
          Workers sit on an internal network with no route to the internet, and can write only to
          the scratch directory belonging to the job in hand.
        </li>
        <li>They receive a minimal environment, so no application secret is visible to them.</li>
        <li>All XML parsing on the Python side is hardened against entity-expansion attacks.</li>
      </ul>

      <h2>Passwords</h2>
      <p>
        A password you type to protect or unlock a PDF is passed to the encryption tool through a
        temporary file readable only by that process, so it never appears in the process list. It is
        deleted immediately afterwards, is never logged, and is never stored. If you lose the
        password to a PDF you encrypted, nobody — including us — can recover it.
      </p>

      <h2>Logging</h2>
      <p>
        Logs record the job ID, which tool ran, how long it took and whether it succeeded. Filenames,
        file contents, extracted text and raw IP addresses are never written to a log. Error reports
        are scrubbed of any field that looks like a path, a filename or an address before they leave
        the server.
      </p>

      <h2>Reporting a vulnerability</h2>
      <p>
        Please email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> with enough
        detail to reproduce the issue. We will acknowledge within 72 hours. Please do not run
        automated scanners against the live service — it shares a machine with other systems, and a
        scan is indistinguishable from an attack.
      </p>

      <h2>What we do not claim</h2>
      <p>
        We are not ISO 27001 certified and we do not pretend to be. This page describes the controls
        that are actually in place; you can read what we retain in the{' '}
        <Link to="/privacy">privacy policy</Link>.
      </p>
    </LegalLayout>
  );
}
