# Third-Party Notices

This project includes third-party software.
Each component remains licensed by its original author under its own license.

Last updated: 2026-08-27

MCP SDK entries and license text updated: 2026-11-18 (other entries retain their previous verification date).

## Runtime dependencies

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| `@babylonjs/core` | `9.2.0` | Apache-2.0 | https://github.com/BabylonJS/Babylon.js |
| `@babylonjs/gui` | `9.2.0` | Apache-2.0 | https://github.com/BabylonJS/Babylon.js |
| `@babylonjs/loaders` | `9.2.0` | Apache-2.0 | https://github.com/BabylonJS/Babylon.js |
| `@babylonjs/materials` | `9.2.0` | Apache-2.0 | https://github.com/BabylonJS/Babylon.js |
| `@modelcontextprotocol/server` | `2.4.0` | Apache-2.0; earlier contributions may remain MIT (see below) | https://github.com/modelcontextprotocol/typescript-sdk |
| `@modelcontextprotocol/node` | `2.1.2` | Apache-2.0; earlier contributions may remain MIT (see below) | https://github.com/modelcontextprotocol/typescript-sdk |
| `babylon-mmd` | `1.2.0` | MIT | https://github.com/noname0310/babylon-mmd |
| `electron-log` | `5.4.3` | MIT | https://github.com/megahertz/electron-log |
| `electron-squirrel-startup` | `1.0.1` | Apache-2.0 | https://github.com/mongodb-js/electron-squirrel-startup |
| `i18next` | `25.8.18` | MIT | https://github.com/i18next/i18next |
| `mediabunny` | `1.39.1` | MPL-2.0 | https://github.com/Vanilagy/mediabunny |

## Build and tooling dependencies

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| `@electron-forge/cli` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/maker-deb` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/maker-dmg` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/maker-rpm` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/maker-squirrel` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/maker-zip` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/plugin-auto-unpack-natives` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/plugin-fuses` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron-forge/plugin-vite` | `7.11.1` | MIT | https://github.com/electron/forge |
| `@electron/fuses` | `1.8.0` | MIT | https://github.com/electron/fuses |
| `@playwright/test` | `1.62.1` | Apache-2.0 | https://github.com/microsoft/playwright |
| `@tailwindcss/vite` | `4.3.0` | MIT | https://github.com/tailwindlabs/tailwindcss |
| `@types/electron-squirrel-startup` | `1.0.2` | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/node` | `25.2.3` | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@typescript-eslint/eslint-plugin` | `5.62.0` | MIT | https://github.com/typescript-eslint/typescript-eslint |
| `@typescript-eslint/parser` | `5.62.0` | BSD-2-Clause | https://github.com/typescript-eslint/typescript-eslint |
| `electron` | `40.4.1` | MIT | https://github.com/electron/electron |
| `eslint` | `8.57.1` | MIT | https://github.com/eslint/eslint |
| `eslint-plugin-import` | `2.32.0` | MIT | https://github.com/import-js/eslint-plugin-import |
| `tailwindcss` | `4.3.0` | MIT | https://github.com/tailwindlabs/tailwindcss |
| `typescript` | `5.9.3` | Apache-2.0 | https://github.com/microsoft/TypeScript |
| `vite` | `7.3.3` | MIT | https://github.com/vitejs/vite |
| `vitest` | `4.1.6` | MIT | https://github.com/vitest-dev/vitest |

## Bundled visual assets

| Asset | Modification | License | Credit | Source |
| --- | --- | --- | --- | --- |
| `YamagataField_20181231_1137` TrueHDRI | Linear box downsample from 16384×8192 Radiance HDR to 2048×1024 | CC0-1.0 | ©Bandai Namco Studios Inc. | https://www.bandainamcostudios.com/projects/truehdri/library/16878 |
| `EitaiBridge_20190111_1215` TrueHDRI | Linear box downsample from 16384×8192 Radiance HDR to 2048×1024 | CC0-1.0 | ©Bandai Namco Studios Inc. | https://www.bandainamcostudios.com/projects/truehdri/library/eitaibridge_20190111_1215 |
| `MifuneBridge_20190311_2140` TrueHDRI | Linear box downsample from 16384×8192 Radiance HDR to 2048×1024 | CC0-1.0 | ©Bandai Namco Studios Inc. | https://www.bandainamcostudios.com/projects/truehdri/library/mifunebridge_20190311_2140 |
| `waterbump.png` | Unmodified local copy | CC-BY-4.0 | BabylonJS | https://github.com/BabylonJS/Assets/blob/master/textures/waterbump.png |

## Notes

- This notice file lists the direct dependencies currently declared in `package.json`.
- Versions, license identifiers, and upstream URLs were verified against the installed package metadata in `node_modules` at the time of update.
- For full transitive dependency license data, check package metadata in `node_modules` and `package-lock.json`.
- If you redistribute binaries, include this file and the project `LICENSE`.

## Model Context Protocol SDK license

The following license is reproduced from the installed SDK packages. It applies to
`@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/node` 2.1.2, and the
transitive `@modelcontextprotocol/core` 2.4.0; all three contain the same license text.

```text
The MCP project is undergoing a licensing transition from the MIT License to the Apache License, Version 2.0 ("Apache-2.0"). All new code and specification contributions to the project are licensed under Apache-2.0. Documentation contributions (excluding specifications) are licensed under CC-BY-4.0.

Contributions for which relicensing consent has been obtained are licensed under Apache-2.0. Contributions made by authors who originally licensed their work under the MIT License and who have not yet granted explicit permission to relicense remain licensed under the MIT License.

No rights beyond those granted by the applicable original license are conveyed for such contributions.

---

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to the Licensor for inclusion in the Work by the copyright
      owner or by an individual or Legal Entity authorized to submit on behalf
      of the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

---

MIT License

Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Creative Commons Attribution 4.0 International (CC-BY-4.0)

Documentation in this project (excluding specifications) is licensed under
CC-BY-4.0. See https://creativecommons.org/licenses/by/4.0/legalcode for
the full license text.
```
