/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2017 Christian Boulanger

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Christian Boulanger (info@bibliograph.org, @cboulanger)

************************************************************************ */

/*global qxcli*/

require("../Contrib");

const qx = require("qooxdoo");
const download = require('download');
const fs = require('fs');
const path_module = require('path');
const process = require('process');

/**
 * Installs a contrib libraries
 */
qx.Class.define("qxcli.commands.contrib.Install", {
  extend: qxcli.commands.Contrib,

  statics: {
    getYargsCommand: function() {
      return {
        command: 'install [repository]',
        describe: 'installs the latest compatible release of a contrib library (as per Manifest.json). Use "-r <release tag>" to install a particular release.',
        builder: {},
        handler: function(argv) {
          return new qxcli.commands.contrib.Install(argv)
            .process()
            .catch((e) => {
              console.error(e.stack || e);
            });
        }
      };
    }
  },

  members: {

    /**
     * Lists contrib libraries compatible with the current project
     */
    process: async function() {
  
      let argv = this.argv;
      let repos_cache = this.getCache().repos;

      if ( repos_cache.list.length == 0 ){
        console.error("You need to execute 'qx contrib update' first.");
        process.exit(1);
      }
    
      let qooxdoo_path = await this.getQooxdooPath(argv);
      if(argv.verbose) console.log(`>>> qooxdoo path:     ${qooxdoo_path}`);
      let qooxdoo_version = this.getQooxdooVersion(qooxdoo_path);
      if(argv.verbose) console.log(`>>> qooxdoo version:  ${qooxdoo_version}`);

      if ( this.getCache().compat[qooxdoo_version] === undefined ){
        console.error("You need to execute 'qx contrib list' first.");
        process.exit(1);
      }
     
      // has a repository name been given?
      let repo_name = argv.repository || (console.error("No repo name given") || process.exit(1) );

      // get compatible tag name
      let tag_name  = this.getCache().compat[qooxdoo_version][repo_name] || argv.release;
      if( ! tag_name && ! this.getCache().repos.data[repo_name] ){
          console.error(`'${repo_name}' does not exist, is not a contrib library, or has no compatible release.`);
          process.exit(1);
      }
      
      // download zip of release
      console.info(`Installing ${repo_name} ${tag_name}`);
      let repo_data = this.getCache().repos.data[repo_name];
      let release_data = repo_data.releases.data[tag_name];
      let url = release_data.zip_url;
      let contrib_dir = [process.cwd(), "contrib", repo_name.replace(/\//g,"_")+"_"+tag_name ];
      let download_path = contrib_dir.reduce((prev,current)=>{
        let dir = prev + path_module.sep + current;
        if( ! fs.existsSync(dir) ) fs.mkdirSync(dir);
        return dir;
      });
      if (argv.verbose) console.log(`>>> Downloading ZIP from ${url} to ${download_path}`);
      try {
        await download(url, download_path, {extract:true, strip: 1});
      } catch (e) {
        console.error(e);
        process.exit(1);
      }
      // read libraries array from contrib.json or create new 
      let contrib_json_path = process.cwd() + "/contrib.json";
      let data = fs.existsSync(contrib_json_path) ?
         JSON.parse( fs.readFileSync(contrib_json_path,"utf-8") ) :
         { libraries : [ ] };
         
      // iterate over contained libraries
      
      for( let { info, path } of release_data.manifests ) {
        // does the repository name already exist?
        let index = data.libraries.findIndex((elem)=>{
          return elem.repo_name == repo_name 
            && elem.library_name == info.name;
        });
        let library_elem = {
          library_name : info.name,
          library_version : info.version,
          repo_name : repo_name,
          repo_tag : tag_name,
          path : download_path + path_module.sep + path_module.dirname(path)
        };
        if( index >= 0 ){
          data.libraries[index]=library_elem;
          if (! argv.quiet) console.info(`Updating already existing compile.json entry '${info.name}'.`);
        } else {
          data.libraries.push(library_elem);
        }
      }
      fs.writeFileSync( contrib_json_path, JSON.stringify(data, null, 2), "utf-8");
      if(argv.verbose) console.info(">>> Done.");
    }
  }
});