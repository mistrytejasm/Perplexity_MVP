import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Globe } from 'lucide-react';

interface SourceCardProps {
    source: any;
    index: number;
    allSources: any[];
    onClick?: (source: any, allSources: any[]) => void;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, index, allSources, onClick }) => {
    const domain = source.domain || (source.url && source.url.startsWith('http') ? new URL(source.url).hostname.replace('www.', '') : 'Website');
    // sz=32 gets a higher res icon
    const faviconUrl = source.type === 'web' && domain !== 'Website' ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;
    const [imgError, setImgError] = useState(false);

    return (
        <motion.div
            onClick={() => onClick && onClick(source, allSources)}
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative flex-shrink-0 w-44 bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow hover:border-gray-300 transition-all cursor-pointer group flex flex-col h-[88px]"
        >
            <div className="flex items-center space-x-2 mb-1.5 w-[85%] relative z-10">
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-gray-50">
                    {source.type === 'web' && faviconUrl && !imgError ? (
                        <img
                            src={faviconUrl}
                            alt={domain}
                            className="w-3.5 h-3.5 rounded-sm mix-blend-multiply"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        source.type === 'web' ? <Globe className="w-3.5 h-3.5 text-gray-400" /> : <FileText className="w-3.5 h-3.5 text-gray-400" />
                    )}
                </div>
                <span className="text-[11px] text-gray-500 truncate font-semibold">
                    {domain}
                </span>
            </div>

            <div className="text-[13px] text-gray-800 font-medium line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors mt-auto w-full pr-1">
                {source.title || source.filename || "Source Document"}
            </div>

            <div className="absolute top-2.5 right-2.5 z-0">
                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[10px] bg-gray-100 group-hover:bg-blue-50 text-gray-500 group-hover:text-blue-600 rounded-full font-bold transition-colors">
                    {index + 1}
                </span>
            </div>
        </motion.div>
    );
};

export default SourceCard;
