/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as path from 'path';

import type { ToolFactory } from './tool';

const downloadSchema = z.object({
  selector: z.string().describe('The CSS selector or aria-ref of the download link to click'),
  saveToFolder: z.string().optional().describe('Optional folder path to save the downloaded file. If not specified, the file will be saved to the browser\'s default download location'),
  newFilename: z.string().optional().describe('Optional new filename for the downloaded file. If not specified, the original filename will be used'),
});

const download: ToolFactory = captureSnapshot => ({
  capability: 'files',
  schema: {
    name: 'browser_download',
    description: 'Click a download link and optionally specify where to save the file',
    inputSchema: zodToJsonSchema(downloadSchema),
  },
  handle: async (context, params) => {
    const validatedParams = downloadSchema.parse(params);
    const tab = context.currentTab();
    
    let downloadPath: string | undefined;
    if (validatedParams.saveToFolder) {
      downloadPath = validatedParams.saveToFolder;
    }
    
    let downloadPromise;
    
    return await tab.runAndWait(async tab => {
      const page = tab.page;
      
      // Set up download handler before clicking
      if (downloadPath) {
        // Configure browser to download to the specified folder
        await page.context().setDefaultDownloadPath(downloadPath);
      }
      
      // Create a promise that resolves when download starts
      downloadPromise = page.waitForEvent('download');
      
      // Click the download link
      const locator = validatedParams.selector.startsWith('[ref=') 
        ? tab.lastSnapshot().refLocator(validatedParams.selector.slice(5, -1))
        : page.locator(validatedParams.selector);
        
      await locator.click();
      
      // Wait for download to start
      const download = await downloadPromise;
      
      // Rename file if needed
      if (validatedParams.newFilename) {
        const suggestedFilename = await download.suggestedFilename();
        const fileExt = path.extname(suggestedFilename);
        const newFilename = validatedParams.newFilename + (validatedParams.newFilename.endsWith(fileExt) ? '' : fileExt);
        
        // Save with new filename
        await download.saveAs(path.join(downloadPath || '', newFilename));
      } else {
        // Save with original filename
        await download.saveAs(path.join(downloadPath || '', await download.suggestedFilename()));
      }
      
      // Wait for download to complete
      await download.path();
      
      // 不返回任何内容，保持返回类型为void
    }, {
      status: `已从 ${validatedParams.selector} 下载文件`,
      captureSnapshot,
    });
  },
});

export default (captureSnapshot: boolean) => [
  download(captureSnapshot),
]; 
