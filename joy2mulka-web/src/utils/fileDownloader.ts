import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { OutputFiles, GlobalSettings } from '../types';

/**
 * Download a single file
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  saveAs(blob, filename);
}

/**
 * Download all files as a ZIP
 */
export async function downloadAllAsZip(
  files: OutputFiles,
  settings: GlobalSettings
): Promise<void> {
  const zip = new JSZip();

  // Create folder
  const folder = zip.folder(settings.outputFolder);
  if (!folder) {
    throw new Error('Failed to create folder in ZIP');
  }

  // Add files
  folder.file('Startlist.csv', files.mulkaCsv);
  folder.file('Role_Startlist.csv', files.roleCsv);
  folder.file('Public_Startlist.tex', files.publicTex);
  folder.file('Role_Startlist.tex', files.roleTex);
  folder.file('Class_Summary.csv', files.classSummaryCsv);

  // Generate ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${settings.outputFolder}.zip`);
}

/**
 * Download individual output file
 */
export function downloadOutputFile(
  fileType: keyof OutputFiles,
  files: OutputFiles,
  settings: GlobalSettings
): void {
  const fileConfig = {
    mulkaCsv: { name: 'Startlist.csv', mime: 'text/csv' },
    roleCsv: { name: 'Role_Startlist.csv', mime: 'text/csv' },
    publicTex: { name: 'Public_Startlist.tex', mime: 'text/x-tex' },
    roleTex: { name: 'Role_Startlist.tex', mime: 'text/x-tex' },
    classSummaryCsv: { name: 'Class_Summary.csv', mime: 'text/csv' },
  };

  const config = fileConfig[fileType];
  const filename = `${settings.outputFolder}_${config.name}`;
  downloadFile(files[fileType], filename, config.mime);
}
