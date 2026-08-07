import { Link } from 'react-router-dom';
import type { ToolDef } from '../tools/registry';

interface ConsentCheckboxProps {
  tool: ToolDef;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Consent for the finance module (spec 15.2).
 *
 * Three things the DPDP Act requires and that are easy to get wrong: it is not
 * pre-ticked, it is not bundled with anything else the user is agreeing to, and
 * the notice sits next to the box rather than behind a link. The user should be
 * able to read what happens to their bank statement without leaving the page.
 */
export default function ConsentCheckbox({ tool, checked, onChange, disabled }: ConsentCheckboxProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <label className="flex cursor-pointer gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-800"
        />
        <span className="text-gray-700">
          I agree to this document being processed to produce the {tool.produces.includes('csv') ? 'CSV' : 'spreadsheet'}.
        </span>
      </label>

      <ul className="mt-3 space-y-1 pl-7 text-xs leading-relaxed text-gray-500">
        <li>It is used for this conversion only, and for nothing else.</li>
        <li>It is deleted within 15 minutes, or the moment you download the result.</li>
        <li>
          No transaction, name, account number or balance is stored — we record only which format
          was detected and how many rows were read.
        </li>
        <li>
          You can delete it sooner at any time, and read the detail in our{' '}
          <Link to="/privacy" className="text-primary underline">
            privacy policy
          </Link>
          .
        </li>
      </ul>
    </div>
  );
}
