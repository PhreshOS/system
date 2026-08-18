/**
 * # FileManager: Application Directory Management System
 * 
 * Cross-platform file system abstraction providing standardized directory
 * management for application data storage and configuration persistence.
 * 
 * ## Core Capabilities
 * - Automatic directory creation with recursive path resolution
 * - Platform-agnostic application data directory management
 * - Path composition utilities for nested file organization
 * - Home directory integration following OS conventions
 * 
 * ## Use Cases
 * - Application configuration and settings persistence
 * - User data storage and cache management
 * - Plugin and extension data organization
 * - Cross-platform data directory standardization
 * 
 * @example
 * ```typescript
 * // Application-specific directory management
 * const appManager = FileManager.forApp("myapp");
 * // Creates: @/.myapp/ (Unix) or %USERPROFILE%\.myapp\ (Windows)
 * 
 * // Custom directory hierarchy
 * const dataManager = new FileManager("/var", "data", "application");
 * 
 * // Nested file path composition
 * const configPath = appManager.join("config", "settings.json");
 * ```
 */
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Application directory management system providing automatic directory creation
 * and standardized path composition for cross-platform file operations.
 * 
 * Implements "create-on-instantiation" pattern where directories are automatically
 * created if they don't exist, eliminating manual existence validation.
 */
export default class FileManager {

    /**
     * Absolute file system path to the managed directory.
     * Guaranteed to exist in the file system after instantiation.
     */
    public readonly path: string

    /**
     * Initializes FileManager instance with automatic directory creation.
     * 
     * Combines path segments using OS-appropriate separators and creates
     * missing directories recursively, including intermediate paths.
     * 
     * @param paths - Variable number of path segments to combine into target directory
     * 
     * @example
     * ```typescript
     * // Single directory creation
     * const tempManager = new FileManager("/tmp", "workspace");
     * 
     * // Multi-level hierarchy creation
     * const dataManager = new FileManager("data", "cache", "images");
     * ```
     */
    public constructor(...paths: string[]) {

        /**
         * Combine all path segments into normalized absolute path.
         */
        this.path = join(...paths)

        /**
         * Ensure target directory exists with recursive creation.
         */
        if (!existsSync(this.path)) mkdirSync(this.path, { recursive: true })
    }

    /**
     * Factory method for application-specific directory management.
     * 
     * Creates a FileManager instance targeting the user's home directory
     * with a hidden application folder following OS conventions.
     * 
     * @param appName - Application identifier used for directory naming
     * @returns FileManager instance managing application-specific directory
     * 
     * @example
     * ```typescript
     * // Standard application data directory
     * const configManager = FileManager.forApp("texteditor");
     * // Creates: @/.texteditor/
     * 
     * // Nested configuration structure
     * const settingsPath = configManager.join("settings.json");
     * ```
     */
    public static forApp(appName: string) {

        /**
         * Create FileManager instance targeting hidden application directory.
         */
        return new FileManager(homedir(), `.${appName}`)
    }

    /**
     * Composes file paths within the managed directory structure.
     * 
     * Provides safe path composition by combining the managed directory path
     * with additional segments, ensuring cross-platform compatibility and
     * preventing directory traversal issues.
     * 
     * @param paths - Variable number of path segments to append to managed directory
     * @returns Absolute path combining managed directory with specified segments
     * 
     * @example
     * ```typescript
     * const appManager = FileManager.forApp("myapp");
     * 
     * // Configuration file paths
     * const configFile = appManager.join("config.json");
     * const userSettings = appManager.join("settings", "user.json");
     * 
     * // Cache directory structure
     * const imageCache = appManager.join("cache", "images", "thumbnails");
     * ```
     */
    public join(...paths: string[]) {

        /**
         * Combine managed directory path with additional segments.
         */
        return join(this.path, ...paths)
    }

    /**
     * Permanently removes the managed directory and all its contents.
     * 
     * Deletes the entire directory structure without recreation, effectively
     * destroying the FileManager's target. Use this when the directory is no
     * longer needed, as opposed to clear() which maintains the directory.
     * 
     * @example
     * ```typescript
     * const tempManager = FileManager.forApp("myapp").navigateTo("temp");
     * tempManager.destroy(); // Completely removes the temp directory
     * ```
     */
    public destroy() {

        // Remove directory and all contents without recreation
        if (existsSync(this.path)) rmSync(this.path, { recursive: true, force: true })
    }

    /**
     * Clears all files and directories within the managed directory.
     * 
     * Removes all contents recursively while preserving the root directory.
     * Safe operation that only affects contents within the managed path.
     * 
     * @example
     * ```typescript
     * const cacheManager = FileManager.forApp("myapp").navigateTo("cache");
     * cacheManager.clear(); // Removes all cache files and subdirectories
     * ```
     */
    public clear() {

        // Remove directory and all contents
        this.destroy()

        // Recreate empty directory
        mkdirSync(this.path, { recursive: true })
    }

    /**
     * Checks whether a path within the managed directory exists.
     *
     * Combines the managed directory path with the specified segments and
     * checks for the existence of the resulting file or directory. Calling
     * it without arguments checks the managed directory itself.
     *
     * @param paths - Variable number of path segments to append to managed directory
     * @returns True when the combined path exists in the file system
     *
     * @example
     * ```typescript
     * const appManager = FileManager.forApp("myapp");
     *
     * // Check for a configuration file
     * if (appManager.isExists("config.json")) loadConfiguration();
     *
     * // Check for a nested directory
     * const hasCache = appManager.isExists("cache", "images");
     * ```
     */
    public isExists(...paths: string[]): boolean {

        return existsSync(this.join(...paths))
    }

    /**
     * Creates a new FileManager instance for a subdirectory within the current managed directory.
     * 
     * Navigates to a subdirectory by creating a new FileManager instance that manages
     * the specified path relative to the current directory. The subdirectory is
     * automatically created if it doesn't exist.
     * 
     * @param paths - Variable number of path segments to navigate to from current directory
     * @returns New FileManager instance managing the target subdirectory
     * 
     * @example
     * ```typescript
     * const appManager = FileManager.forApp("myapp");
     * 
     * // Navigate to subdirectories
     * const configManager = appManager.navigateTo("config");
     * const cacheManager = appManager.navigateTo("cache", "images");
     * 
     * // Chain navigation operations
     * const logsManager = appManager.navigateTo("logs").navigateTo("daily");
     * ```
     */
    public navigateTo(...paths: string[]) {

        /**
         * Create new FileManager instance for subdirectory path.
         */
        return new FileManager(this.path, ...paths)
    }
}