import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyEditorFlows(origin,songs,setlists,rejectSetlistCreate) {
  const engine=process.env.HYMN_BROWSER_ENGINE||'chromium';
  const playwright=await import(pathToFileURL(resolve(process.env.HYMN_PLAYWRIGHT_ENTRY)).href);
  const executablePath=engine==='chromium'?(process.env.HYMN_CHROME_BINARY||'C:/Program Files/Google/Chrome/Application/chrome.exe'):undefined;
  const browser=await playwright[engine].launch({executablePath});
  const artifacts=process.env.HYMN_BROWSER_ARTIFACTS;
  const scanImage=process.env.HYMN_OCR_TEST_IMAGE;
  const example='VERSE 1:\nHimig ng pag-ibig.\n(Chorus)\nChorus starts with a word\nC  G/B  Am  F';
  const sizes=[[375,667],[390,844],[768,1024],[1366,768],[1920,1080]];
  try {
    if(scanImage) {
      const page=await browser.newPage();
      page.on('dialog',dialog=>dialog.accept());
      await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
      await page.goto(origin);
      await page.locator('.h-rail .h-create').click();
      await page.getByRole('dialog',{name:'Create'}).getByRole('button',{name:/Paste lyrics/}).click();
      await page.evaluate(value=>navigator.clipboard.writeText(value),example);
      await page.getByRole('button',{name:'Paste from clipboard'}).click();
      const write=page.getByRole('textbox',{name:'Lyrics',exact:true});
      assert.match(await write.inputValue(),/Himig ng pag-ibig/);
      await page.evaluate(()=>{navigator.clipboard.readText=()=>Promise.reject(new Error('Clipboard test denied'));});
      await page.getByRole('button',{name:'Paste from clipboard'}).click();
      await page.getByText('Long-press in the lyrics field', {exact:false}).waitFor();
      await write.fill('');
      await page.locator('.h-song-editor input[type=file]').first().setInputFiles(scanImage);
      const review=page.getByLabel('Review scanned lyrics');
      await review.waitFor({timeout:30000});
      const extracted=await review.inputValue();
      assert.match(extracted,/together again/i);
      await page.getByRole('button',{name:'Insert lyrics'}).click();
      assert.equal(await write.inputValue(),extracted);
      assert.equal(songs.length,3);
      await page.waitForFunction(text=>Object.values(localStorage).some(value=>{
        try { return JSON.parse(value)?.lyrics===text; } catch { return false; }
      }),extracted);
      await page.reload();
      await page.getByRole('button',{name:'Restore draft'}).click();
      assert.equal(await write.inputValue(),extracted);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.locator('.h-rail .h-create').click();
      await page.getByRole('dialog',{name:'Create'}).getByRole('button',{name:/Paste setlist/}).click();
      const paste=page.getByRole('dialog',{name:'Paste setlist'});
      await paste.locator('textarea').fill('Agnus dei (anniv)\nA song awaiting lyrics');
      await paste.getByRole('button',{name:'Create song',exact:true}).click();
      assert.equal(songs.length,3);
      await paste.getByRole('button',{name:'Create setlist with 2 songs',exact:true}).click();
      await page.waitForURL('**/setlists/2');
      await page.goto(origin+'/songs/4');
      await page.locator('.h-reading').getByText('No lyrics',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Add lyrics',exact:true}).click();
      await page.getByRole('button',{name:'Paste from clipboard'}).waitFor();
      assert.equal(await write.inputValue(),'');
      console.log('Clipboard success and fallback, photo OCR, draft restoration, and Add lyrics passed with disposable data.');
      return;
    }
    for (const [width,height] of sizes) {
      const mobile=width<900;
      const page=await browser.newPage({viewport:{width,height},hasTouch:mobile,isMobile:mobile});
      page.setDefaultTimeout(6000);
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      async function capture(name) {
        const checked=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
        assert.ok(checked,name+' at '+width+'px has page overflow');
        if(!artifacts) return;
        for(const theme of ['light','dark']) {
          await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
          await page.screenshot({path:join(artifacts,`hymn-${engine}-${width}-${theme}-${name}.png`),animations:'disabled'});
        }
      }
      async function simulateKeyboard(open) {
        return page.evaluate(show=>{
          const viewport=window.visualViewport;
          if(show) Object.defineProperty(viewport,'height',{value:innerHeight-320,configurable:true});
          else delete viewport.height;
          viewport.dispatchEvent(new Event('resize'));
          return document.querySelector('.h-app').hasAttribute('data-keyboard-open');
        },open);
      }
      const create=page.locator(mobile?'.h-bottom-create':'.h-rail .h-create');
      const text=page.locator('textarea[aria-label="Lyrics"]');
      const preview=page.locator('.h-lyrics-preview');
      const button=(name)=>page.getByRole('button',{name,exact:true});
      await page.goto(origin);
      await create.click();
      await page.getByRole('dialog',{name:'Create'}).getByRole('button',{name:/Write a song/}).click();
      await text.waitFor();
      assert.equal(await text.evaluate(node=>document.activeElement===node),true);
      await capture('empty-lyrics');
      if(width===390) {
        assert.equal(await simulateKeyboard(true),true);
        await page.waitForFunction(()=>{
          const field=document.querySelector('.h-raw-lyrics').getBoundingClientRect();
          return field.y<document.querySelector('.h-editor-footer').getBoundingClientRect().y;
        });
        const toolbar=await page.locator('.h-editor-toolbar').boundingBox();
        assert.ok(Math.abs(toolbar.y+toolbar.height-(height-320))<2);
        await capture('lyrics-keyboard-simulated');
        await simulateKeyboard(false);
      }
      await text.fill(example);
      await page.getByText('Found 1 chord line.',{exact:true}).waitFor();
      await text.evaluate(node=>node.scrollIntoView({block:'start'}));
      await capture('lyrics-suggestions');
      if(width<1200) await button('Preview').click();
      await preview.getByText('Chorus',{exact:true}).waitFor();
      assert.match(await preview.innerText(),/Himig ng pag-ibig/);
      await preview.scrollIntoViewIfNeeded();
      await capture('lyrics-preview');
      await button('Sections').click();
      assert.equal(await page.locator('[data-lyric-index]').count(),2);
      await page.locator('[data-lyric-index]').first().scrollIntoViewIfNeeded();
      await capture('lyrics-sections');
      await button('Write').click();
      assert.equal(await text.inputValue(),example);
      await text.evaluate(node=>{node.focus();node.setSelectionRange(node.value.length,node.value.length);});
      if(width>=900) await page.getByTitle('Insert Verse label').scrollIntoViewIfNeeded();
      await page.getByTitle('Insert Verse label').click();
      assert.match(await text.inputValue(),/\[Verse 2\]\n$/);
      assert.ok(await text.evaluate(node=>document.activeElement===node && node.selectionStart===node.value.length));
      await text.press('Control+z');
      assert.equal(await text.inputValue(),example);
      await text.fill('[Verse 1]\n'+Array.from({length:60},(_,index)=>'Worship line '+index).join('\n'));
      const panel=page.locator('.h-detail');
      await panel.evaluate(node=>{node.scrollTop=node.scrollHeight;});
      const footer=await page.locator('#h-editor-footer-host').boundingBox();
      const bounds=await panel.boundingBox();
      assert.ok(bounds.y+bounds.height<=footer.y+1);
      assert.equal(await text.evaluate(node=>getComputedStyle(node).overflowY),'hidden');
      await capture('lyrics-long-footer');
      await button('Cancel').click();
      await text.waitFor({state:'detached'});

      const paste=page.getByRole('dialog',{name:'Paste setlist'});
      const pasteText=paste.locator('textarea');
      const primary=paste.locator('.h-paste-buttons .h-primary');
      await create.click();
      await page.getByRole('dialog',{name:'Create'}).getByRole('button',{name:/Paste setlist/}).click();
      await pasteText.waitFor();
      if(mobile) {
        assert.equal(await paste.evaluate(node=>node.offsetWidth),width);
        assert.ok(await primary.evaluate(node=>node.offsetWidth)>=width-36);
      }
      await capture('paste-empty');
      if(width===390) {
        await pasteText.focus();
        assert.equal(await simulateKeyboard(true),true);
        const bar=await paste.locator('.h-dialog-footer').boundingBox();
        assert.ok(Math.abs(bar.y+bar.height-(height-320))<2);
        await capture('paste-keyboard-simulated');
        await simulateKeyboard(false);
      }
      const list='10,000 reasons\nAgnus dei (anniv)\nMissing example\n10,000 reasons';
      await pasteText.fill(list);
      if(mobile) await primary.click();
      await paste.getByText('Duplicate',{exact:true}).waitFor();
      assert.equal(await paste.locator('select, input[type=radio]').count(),0);
      await capture('paste-mixed');
      await paste.getByRole('button',{name:'Search library',exact:true}).click();
      const picker=page.getByRole('dialog',{name:'Search library'});
      await picker.getByRole('searchbox').fill('Omega');
      await picker.locator('mark').waitFor();
      await capture('paste-picker');
      await picker.getByRole('button',{name:/Alpha omega/}).click();
      await paste.getByText('Alpha omega (anniv)',{exact:true}).waitFor();
      if(mobile) {
        await paste.getByRole('button',{name:'Back to paste',exact:true}).click();
        assert.equal(await pasteText.inputValue(),list);
      }
      await pasteText.fill('10,000 reasons\nAgnus dei (anniv)');
      if(mobile) await primary.click();
      await paste.getByText('2 lines · 2 matched · 0 need a choice · 0 not found',{exact:true}).waitFor();
      await capture('paste-all-matched');
      rejectSetlistCreate(true);
      try {
        await primary.click();
        await paste.getByRole('alert').getByText('Test setlist save failed',{exact:true}).waitFor();
        assert.equal(await pasteText.inputValue(),'10,000 reasons\nAgnus dei (anniv)');
        await capture('paste-save-error');
      } finally {
        rejectSetlistCreate(false);
      }
      await paste.getByRole('button',{name:'Cancel',exact:true}).click();
      await paste.waitFor({state:'hidden'});
      await page.goto(origin+'/setlists/1?edit=current');
      const status=page.getByRole('button',{name:'Status Draft',exact:true});
      await status.click();
      assert.equal(await page.getByRole('option').count(),4);
      await status.scrollIntoViewIfNeeded();
      await capture('setlist-status');
      await page.keyboard.press('Escape');
      if(!mobile) {
        await page.getByRole('button',{name:/^Date:/}).click();
        await page.getByRole('dialog',{name:'Choose a date'}).waitFor();
        await capture('setlist-date');
        await page.keyboard.press('Escape');
      } else assert.equal(await page.locator('input[type=date]').count(),1);
      await button('Paste setlist').click();
      await pasteText.fill('Agnus dei (anniv)');
      if(mobile) await primary.click();
      await paste.getByRole('button',{name:'Replace songs',exact:true}).click();
      await paste.getByText(/This replaces the 3 songs/).waitFor();
      await capture('paste-replace');
      assert.equal(songs.length,3);
      assert.equal(setlists.length,1);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log(`${engine}: editor and setlist passed at ${sizes.length} viewport widths using disposable data.`);
  } finally {
    await browser.close();
  }
}
